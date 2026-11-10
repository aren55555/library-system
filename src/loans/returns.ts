import { one, run, tx } from '../db/connection.ts';
import { toDateKey } from '../lib/dates.ts';
import { conflict } from '../lib/errors.ts';
import { chargeOverdueThrough } from '../fines/accrue.ts';
import { assignNextHold } from '../holds/queue.ts';
import { getCopyByBarcode } from '../patrons/repo.ts';
import type { Ctx } from '../context.ts';
import type { Branch, Fine, Hold, Loan } from '../types.ts';

export interface ReturnResult {
  loan: Loan;
  finesCharged: Fine[];
  // Set when the returned copy went straight to someone's hold.
  hold: Hold | null;
}

export async function returnCopy(ctx: Ctx, barcode: string, branch: Branch): Promise<ReturnResult> {
  const { loan, finesCharged, copyId } = tx(ctx.db, () => {
    const copy = getCopyByBarcode(ctx.db, barcode);
    const loan = one<Loan>(ctx.db, 'SELECT * FROM loans WHERE copy_id = ? AND returned_at IS NULL', copy.id);
    if (!loan) throw conflict('not_on_loan', 'This copy is not checked out');

    const now = ctx.clock.now();
    run(ctx.db, 'UPDATE loans SET returned_at = ? WHERE id = ?', now.toISOString(), loan.id);

    // Late if returned on a day after the due date.
    const finesCharged = chargeOverdueThrough(ctx, loan, toDateKey(now));

    // Copies float: they belong to whichever branch they were returned to.
    run(
      ctx.db,
      "UPDATE copies SET status = 'available', branch_id = ?, updated_at = ? WHERE id = ?",
      branch.id,
      now.toISOString(),
      copy.id,
    );
    ctx.availability.invalidate(copy.title_id);

    return {
      loan: one<Loan>(ctx.db, 'SELECT * FROM loans WHERE id = ?', loan.id)!,
      finesCharged,
      copyId: copy.id,
    };
  });

  const hold = await assignNextHold(ctx, copyId);
  return { loan, finesCharged, hold };
}
