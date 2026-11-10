import { Router } from 'express';
import { getTitleDetail, searchCatalog } from '../catalog/search.ts';
import { badRequest } from '../lib/errors.ts';
import { optionalString, requireId } from '../lib/validate.ts';
import { listBranches } from '../patrons/repo.ts';
import type { Ctx } from '../context.ts';

export function catalogRouter(ctx: Ctx): Router {
  const router = Router();

  router.get('/branches', (_req, res) => {
    res.json({ branches: listBranches(ctx.db) });
  });

  router.get('/catalog/search', (req, res) => {
    const q = optionalString(req.query.q);
    if (!q || q.length < 2) throw badRequest('query_too_short', 'Search needs at least 2 characters');
    const page = req.query.page ? requireId(req.query.page, 'page') : 1;
    const pageSize = Math.min(req.query.pageSize ? requireId(req.query.pageSize, 'pageSize') : 20, 50);
    res.json(
      searchCatalog(ctx, {
        q,
        format: optionalString(req.query.format),
        audience: optionalString(req.query.audience),
        page,
        pageSize,
      }),
    );
  });

  router.get('/catalog/titles/:id', (req, res) => {
    res.json(getTitleDetail(ctx, requireId(req.params.id, 'id')));
  });

  return router;
}
