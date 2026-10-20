import { all, run } from '../db/connection.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { chargeOverdueThrough } from '../fines/accrue.ts';
import { assignNextHold } from '../holds/queue.ts';
import { dueSoonEmail, holdExpiredEmail } from '../notify/templates.ts';
import { getPatron, getTitle } from '../patrons/repo.ts';
import type { Ctx } from '../context.ts';
import type { Hold, Loan, Title } from '../types.ts';

export interface NightlySummary {
  day: string;
  finesCharged: number;
  remindersSent: number;
  holdsExpired: number;
  holdsReassigned: number;
}

// Cloud Scheduler runs this every day at 09:00 UTC (1am Pacific), after all
// branches have closed.
export async function runNightly(ctx: Ctx): Promise<NightlySummary> {
  const day = toDateKey(ctx.clock.now());
  const summary: NightlySummary = { day, finesCharged: 0, remindersSent: 0, holdsExpired: 0, holdsReassigned: 0 };

  // 1. Overdue fines, catching up on any days a previous run missed.
  const overdue = all<Loan>(ctx.db, 'SELECT * FROM loans WHERE returned_at IS NULL AND due_date < ?', day);
  for (const loan of overdue) {
    summary.finesCharged += chargeOverdueThrough(ctx, loan, day).length;
  }

  // 2. "Due tomorrow" reminders, one email per patron.
  const tomorrow = addDays(day, 1);
  const dueSoon = all<Loan & { title_id: number }>(
    ctx.db,
    `SELECT l.*, c.title_id FROM loans l JOIN copies c ON c.id = l.copy_id
     WHERE l.returned_at IS NULL AND l.due_date = ? AND l.reminder_sent_on IS NULL`,
    tomorrow,
  );
  const byPatron = new Map<number, { titles: Title[]; loanIds: number[] }>();
  for (const loan of dueSoon) {
    const entry = byPatron.get(loan.patron_id) ?? { titles: [], loanIds: [] };
    entry.titles.push(getTitle(ctx.db, loan.title_id));
    entry.loanIds.push(loan.id);
    byPatron.set(loan.patron_id, entry);
  }
  for (const [patronId, { titles, loanIds }] of byPatron) {
    await ctx.outbox.send(dueSoonEmail(getPatron(ctx.db, patronId), titles, tomorrow));
    for (const id of loanIds) run(ctx.db, 'UPDATE loans SET reminder_sent_on = ? WHERE id = ?', day, id);
    summary.remindersSent++;
  }

  // 3. Ready holds nobody picked up. The copy goes to the next person in line,
  //    or back on the shelf.
  const expired = all<Hold>(ctx.db, "SELECT * FROM holds WHERE status = 'ready' AND expires_on < ?", day);
  for (const hold of expired) {
    const now = ctx.clock.now().toISOString();
    run(ctx.db, "UPDATE holds SET status = 'expired', closed_at = ? WHERE id = ?", now, hold.id);
    summary.holdsExpired++;
    await ctx.outbox.send(holdExpiredEmail(getPatron(ctx.db, hold.patron_id), getTitle(ctx.db, hold.title_id)));
    if (hold.copy_id) {
      run(ctx.db, "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?", now, hold.copy_id);
      if (await assignNextHold(ctx, hold.copy_id)) summary.holdsReassigned++;
    }
  }

  return summary;
}
