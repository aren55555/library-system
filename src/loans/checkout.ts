import { one, run, tx } from '../db/connection.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { conflict, forbidden } from '../lib/errors.ts';
import { getBalance } from '../fines/balance.ts';
import { getCopyByBarcode, getPatronByCard, getTitle } from '../patrons/repo.ts';
import { BLOCK_THRESHOLD, LOAN_DAYS, MAX_ACTIVE_LOANS } from './policy.ts';
import type { Ctx } from '../context.ts';
import type { Branch, Hold, Loan } from '../types.ts';

export interface CheckoutInput {
  cardNumber: string;
  barcode: string;
  branch: Branch;
}

export function checkout(ctx: Ctx, input: CheckoutInput): Loan {
  return tx(ctx.db, () => {
    const patron = getPatronByCard(ctx.db, input.cardNumber);
    const copy = getCopyByBarcode(ctx.db, input.barcode);
    const title = getTitle(ctx.db, copy.title_id);
    const now = ctx.clock.now();

    if (getBalance(ctx, patron.id) > BLOCK_THRESHOLD) {
      throw forbidden('account_blocked', 'This account owes more than the limit. Please pay fines first.');
    }

    const active = one<{ n: number }>(
      ctx.db,
      'SELECT COUNT(*) AS n FROM loans WHERE patron_id = ? AND returned_at IS NULL',
      patron.id,
    );
    if ((active?.n ?? 0) >= MAX_ACTIVE_LOANS[patron.card_type]) {
      throw forbidden('loan_limit', 'This account has reached its checkout limit');
    }

    if (copy.branch_id !== input.branch.id) {
      throw conflict('wrong_branch', 'This copy belongs to a different branch. Return it there first.');
    }

    if (copy.status === 'on_hold_shelf') {
      // A copy on the hold shelf can only go to the patron it is waiting for.
      const hold = one<Hold>(ctx.db, "SELECT * FROM holds WHERE copy_id = ? AND status = 'ready'", copy.id);
      if (!hold || hold.patron_id !== patron.id) {
        throw conflict('on_hold_for_another_patron', 'This copy is on the hold shelf for another patron');
      }
      run(ctx.db, "UPDATE holds SET status = 'fulfilled', closed_at = ? WHERE id = ?", now.toISOString(), hold.id);
    } else if (copy.status !== 'available') {
      throw conflict('copy_unavailable', `This copy is ${copy.status.replaceAll('_', ' ')}`);
    }

    const dueDate = addDays(toDateKey(now), LOAN_DAYS[title.format]);
    const { id } = run(
      ctx.db,
      `INSERT INTO loans (copy_id, patron_id, branch_id, checked_out_at, due_date)
       VALUES (?, ?, ?, ?, ?)`,
      copy.id,
      patron.id,
      input.branch.id,
      now.toISOString(),
      dueDate,
    );
    run(ctx.db, "UPDATE copies SET status = 'on_loan', updated_at = ? WHERE id = ?", now.toISOString(), copy.id);
    ctx.availability.invalidate(copy.title_id);

    return one<Loan>(ctx.db, 'SELECT * FROM loans WHERE id = ?', id)!;
  });
}
