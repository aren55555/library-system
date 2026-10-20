import { one, run } from '../db/connection.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { conflict, forbidden, notFound } from '../lib/errors.ts';
import { getCopy, getTitle } from '../patrons/repo.ts';
import { LOAN_DAYS, MAX_RENEWALS } from './policy.ts';
import type { Ctx } from '../context.ts';
import type { Loan } from '../types.ts';

export function renewLoan(ctx: Ctx, patronId: number, loanId: number): Loan {
  const loan = one<Loan>(ctx.db, 'SELECT * FROM loans WHERE id = ?', loanId);
  if (!loan || loan.patron_id !== patronId) throw notFound('loan_not_found', `No loan with id ${loanId}`);
  if (loan.returned_at) throw conflict('already_returned', 'This item was already returned');
  if (loan.renewals >= MAX_RENEWALS) {
    throw forbidden('renewal_limit', `Items can be renewed at most ${MAX_RENEWALS} times`);
  }

  const copy = getCopy(ctx.db, loan.copy_id);
  const waiting = one<{ n: number }>(
    ctx.db,
    "SELECT COUNT(*) AS n FROM holds WHERE title_id = ? AND status = 'waiting'",
    copy.title_id,
  );
  if ((waiting?.n ?? 0) > 0) {
    throw forbidden('holds_waiting', 'Someone is waiting for this item, so it cannot be renewed');
  }

  // Renewals extend from the current due date, so renewing early never
  // shortens a loan. An overdue item renews from today instead; fines already
  // charged stay on the account.
  const todayKey = toDateKey(ctx.clock.now());
  const base = loan.due_date < todayKey ? todayKey : loan.due_date;
  const dueDate = addDays(base, LOAN_DAYS[getTitle(ctx.db, copy.title_id).format]);

  run(
    ctx.db,
    'UPDATE loans SET due_date = ?, renewals = renewals + 1, reminder_sent_on = NULL WHERE id = ?',
    dueDate,
    loan.id,
  );
  return one<Loan>(ctx.db, 'SELECT * FROM loans WHERE id = ?', loan.id)!;
}
