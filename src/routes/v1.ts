import { Router } from 'express';
import { all } from '../db/connection.ts';
import type { Ctx } from '../context.ts';

// DEPRECATED: v1 search, still used by the self-service kiosks at the Cedar
// Falls branch. Do not add features here. Remove once the kiosks are on v2.
export function v1Router(ctx: Ctx): Router {
  const router = Router();

  router.get('/search', (req, res) => {
    const q = typeof req.query.title === 'string' ? req.query.title : '';
    const rows = all<{ id: number; title: string; author: string; branch: string; available: number }>(
      ctx.db,
      `SELECT t.id, t.title, t.author, b.code AS branch, COUNT(c.id) AS available
       FROM titles t
       JOIN copies c ON c.title_id = t.id AND c.status = 'available'
       JOIN branches b ON b.id = c.branch_id
       WHERE t.title LIKE ?
       GROUP BY t.id, b.code
       ORDER BY t.title
       LIMIT 100`,
      `%${q}%`,
    );
    res.json({ items: rows });
  });

  return router;
}
