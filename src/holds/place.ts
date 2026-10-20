import { all, one, run, tx } from '../db/connection.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { conflict, forbidden, notFound } from '../lib/errors.ts';
import { getBalance } from '../fines/balance.ts';
import { holdReadyEmail } from '../notify/templates.ts';
import { getBranch, getPatron, getTitle } from '../patrons/repo.ts';
import { BLOCK_THRESHOLD, HOLD_PICKUP_DAYS, MAX_ACTIVE_HOLDS } from '../loans/policy.ts';
import { assignNextHold } from './queue.ts';
import type { Ctx } from '../context.ts';
import type { Copy, Hold } from '../types.ts';

export async function placeHold(ctx: Ctx, patronId: number, titleId: number, pickupBranchId: number): Promise<Hold> {
  const patron = getPatron(ctx.db, patronId);
  const title = getTitle(ctx.db, titleId);
  const pickup = getBranch(ctx.db, pickupBranchId);

  const hold = tx(ctx.db, () => {
    if (getBalance(ctx, patron.id) > BLOCK_THRESHOLD) {
      throw forbidden('account_blocked', 'This account owes more than the limit. Please pay fines first.');
    }

    const duplicate = one<Hold>(
      ctx.db,
      "SELECT * FROM holds WHERE patron_id = ? AND title_id = ? AND status IN ('waiting', 'ready')",
      patron.id,
      title.id,
    );
    if (duplicate) throw conflict('duplicate_hold', 'You already have a hold on this title');

    const onLoan = one<{ n: number }>(
      ctx.db,
      `SELECT COUNT(*) AS n FROM loans l JOIN copies c ON c.id = l.copy_id
       WHERE l.patron_id = ? AND c.title_id = ? AND l.returned_at IS NULL`,
      patron.id,
      title.id,
    );
    if ((onLoan?.n ?? 0) > 0) throw conflict('already_checked_out', 'You already have this title checked out');

    const active = one<{ n: number }>(
      ctx.db,
      "SELECT COUNT(*) AS n FROM holds WHERE patron_id = ? AND status IN ('waiting', 'ready')",
      patron.id,
    );
    if ((active?.n ?? 0) >= MAX_ACTIVE_HOLDS) {
      throw forbidden('hold_limit', `You can have at most ${MAX_ACTIVE_HOLDS} holds at once`);
    }

    const now = ctx.clock.now();
    const { id } = run(
      ctx.db,
      `INSERT INTO holds (title_id, patron_id, pickup_branch_id, status, placed_at)
       VALUES (?, ?, ?, 'waiting', ?)`,
      title.id,
      patron.id,
      pickup.id,
      now.toISOString(),
    );

    // If a copy is on the shelf at the pickup branch, pull it for this patron
    // now instead of waiting for a return.
    const shelfCopy = one<Copy>(
      ctx.db,
      "SELECT * FROM copies WHERE title_id = ? AND branch_id = ? AND status = 'available' ORDER BY id LIMIT 1",
      title.id,
      pickup.id,
    );
    if (shelfCopy) {
      const expiresOn = addDays(toDateKey(now), HOLD_PICKUP_DAYS);
      run(
        ctx.db,
        "UPDATE holds SET status = 'ready', copy_id = ?, ready_at = ?, expires_on = ? WHERE id = ?",
        shelfCopy.id,
        now.toISOString(),
        expiresOn,
        id,
      );
      run(ctx.db, "UPDATE copies SET status = 'on_hold_shelf', updated_at = ? WHERE id = ?", now.toISOString(), shelfCopy.id);
    }

    return one<Hold>(ctx.db, 'SELECT * FROM holds WHERE id = ?', id)!;
  });

  if (hold.status === 'ready' && hold.expires_on) {
    await ctx.outbox.send(holdReadyEmail(patron, title, pickup, hold.expires_on));
  }
  return hold;
}

export async function cancelHold(ctx: Ctx, patronId: number, holdId: number): Promise<Hold> {
  const hold = one<Hold>(ctx.db, 'SELECT * FROM holds WHERE id = ?', holdId);
  if (!hold || hold.patron_id !== patronId) throw notFound('hold_not_found', `No hold with id ${holdId}`);
  if (hold.status !== 'waiting' && hold.status !== 'ready') {
    throw conflict('hold_closed', `This hold is already ${hold.status}`);
  }

  const now = ctx.clock.now().toISOString();
  run(ctx.db, "UPDATE holds SET status = 'cancelled', closed_at = ? WHERE id = ?", now, hold.id);

  if (hold.status === 'ready' && hold.copy_id) {
    run(ctx.db, "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?", now, hold.copy_id);
    await assignNextHold(ctx, hold.copy_id);
  }
  return one<Hold>(ctx.db, 'SELECT * FROM holds WHERE id = ?', hold.id)!;
}

export interface HoldWithPosition extends Hold {
  title: string;
  position: number | null;
}

export function listHolds(ctx: Ctx, patronId: number): HoldWithPosition[] {
  const holds = all<Hold & { title: string }>(
    ctx.db,
    `SELECT h.*, t.title FROM holds h JOIN titles t ON t.id = h.title_id
     WHERE h.patron_id = ? ORDER BY h.placed_at DESC`,
    patronId,
  );
  return holds.map((hold) => {
    if (hold.status !== 'waiting') return { ...hold, position: null };
    const ahead = one<{ n: number }>(
      ctx.db,
      `SELECT COUNT(*) AS n FROM holds WHERE title_id = ? AND status = 'waiting'
       AND (placed_at < ? OR (placed_at = ? AND id < ?))`,
      hold.title_id,
      hold.placed_at,
      hold.placed_at,
      hold.id,
    );
    return { ...hold, position: (ahead?.n ?? 0) + 1 };
  });
}
