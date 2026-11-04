import { one, run } from '../db/connection.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { holdReadyEmail } from '../notify/templates.ts';
import { getBranch, getCopy, getPatron, getTitle } from '../patrons/repo.ts';
import { HOLD_PICKUP_DAYS } from '../loans/policy.ts';
import type { Ctx } from '../context.ts';
import type { Hold } from '../types.ts';

export function nextWaitingHold(ctx: Ctx, titleId: number): Hold | undefined {
  return one<Hold>(
    ctx.db,
    "SELECT * FROM holds WHERE title_id = ? AND status = 'waiting' ORDER BY placed_at, id LIMIT 1",
    titleId,
  );
}

// Called when a copy becomes free (returned, or a ready hold expired or was
// cancelled). Gives the copy to the next patron in line, if there is one.
export async function assignNextHold(ctx: Ctx, copyId: number): Promise<Hold | null> {
  const copy = getCopy(ctx.db, copyId);
  const hold = nextWaitingHold(ctx, copy.title_id);
  if (!hold) return null;

  const patron = getPatron(ctx.db, hold.patron_id);
  const title = getTitle(ctx.db, copy.title_id);
  const pickup = getBranch(ctx.db, hold.pickup_branch_id);
  const now = ctx.clock.now();
  const expiresOn = addDays(toDateKey(now), HOLD_PICKUP_DAYS);

  // Let the patron know right away. Pickup windows are short, so the email
  // should not wait on anything else.
  await ctx.outbox.send(holdReadyEmail(patron, title, pickup, expiresOn));

  run(
    ctx.db,
    "UPDATE holds SET status = 'ready', copy_id = ?, ready_at = ?, expires_on = ? WHERE id = ?",
    copy.id,
    now.toISOString(),
    expiresOn,
    hold.id,
  );
  // The copy goes to the pickup branch's hold shelf (staff move it if needed).
  run(
    ctx.db,
    "UPDATE copies SET status = 'on_hold_shelf', branch_id = ?, updated_at = ? WHERE id = ?",
    pickup.id,
    now.toISOString(),
    copy.id,
  );

  return one<Hold>(ctx.db, 'SELECT * FROM holds WHERE id = ?', hold.id)!;
}
