import { all } from '../db/connection.ts';
import type { Ctx } from '../context.ts';

// What staff should find on a branch's hold shelf.
export function holdShelf(ctx: Ctx, branchId: number) {
  return all<{ hold_id: number; barcode: string; title: string; patron: string; expires_on: string }>(
    ctx.db,
    `SELECT h.id AS hold_id, c.barcode, t.title, p.name AS patron, h.expires_on
     FROM holds h
     JOIN copies c ON c.id = h.copy_id
     JOIN titles t ON t.id = h.title_id
     JOIN patrons p ON p.id = h.patron_id
     WHERE h.status = 'ready' AND h.pickup_branch_id = ?
     ORDER BY h.expires_on, p.name`,
    branchId,
  );
}
