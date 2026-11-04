import { all, one, run } from '../db/connection.ts';
import { addDays } from '../lib/dates.ts';
import { sum } from '../lib/money.ts';
import { DAILY_FINE } from '../loans/policy.ts';
import { getCopy, getPatron, getTitle } from '../patrons/repo.ts';
import type { Ctx } from '../context.ts';
import type { Fine, Loan } from '../types.ts';

export function overdueTotal(ctx: Ctx, loanId: number): number {
  const rows = all<{ amount: number }>(
    ctx.db,
    "SELECT amount FROM fines WHERE loan_id = ? AND kind = 'overdue' AND waived_at IS NULL",
    loanId,
  );
  return sum(rows.map((row) => row.amount));
}

// Charges one day's overdue fine for a loan. Safe to call more than once for
// the same day: the second call does nothing.
export function chargeOverdueDay(ctx: Ctx, loan: Loan, forDate: string): Fine | null {
  const existing = one<Fine>(
    ctx.db,
    "SELECT * FROM fines WHERE loan_id = ? AND for_date = ? AND kind = 'overdue'",
    loan.id,
    forDate,
  );
  if (existing) return null;

  const patron = getPatron(ctx.db, loan.patron_id);
  const title = getTitle(ctx.db, getCopy(ctx.db, loan.copy_id).title_id);

  // Overdue fines stop once they reach the item's replacement cost.
  if (overdueTotal(ctx, loan.id) >= title.replacement_cost) return null;

  const { id } = run(
    ctx.db,
    `INSERT INTO fines (patron_id, loan_id, kind, amount, for_date, created_at)
     VALUES (?, ?, 'overdue', ?, ?, ?)`,
    patron.id,
    loan.id,
    DAILY_FINE[patron.card_type],
    forDate,
    ctx.clock.now().toISOString(),
  );
  return one<Fine>(ctx.db, 'SELECT * FROM fines WHERE id = ?', id) ?? null;
}

// Charges every overdue day from the day after the due date through lastDay,
// skipping days already charged. Returns the new fines.
export function chargeOverdueThrough(ctx: Ctx, loan: Loan, lastDay: string): Fine[] {
  const charged: Fine[] = [];
  for (let day = addDays(loan.due_date, 1); day <= lastDay; day = addDays(day, 1)) {
    const fine = chargeOverdueDay(ctx, loan, day);
    if (fine) charged.push(fine);
  }
  return charged;
}
