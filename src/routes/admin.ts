import { Router } from 'express';
import { OffsetClock } from '../clock.ts';
import { addTitle } from '../catalog/titles.ts';
import { badRequest, HttpError } from '../lib/errors.ts';
import { requireAmount, requireId, requireOneOf, requireString } from '../lib/validate.ts';
import { createPatron, getBranchByCode } from '../patrons/repo.ts';
import { runNightly } from '../jobs/nightly.ts';
import { requireStaff } from '../middleware/auth.ts';
import type { Ctx } from '../context.ts';

export function adminRouter(ctx: Ctx): Router {
  const router = Router();
  router.use(requireStaff(ctx));

  router.post('/jobs/nightly', async (_req, res) => {
    res.json(await runNightly(ctx));
  });

  // A new library card, signed up for at the desk.
  router.post('/patrons', (req, res) => {
    const cardNumber = requireString(req.body?.cardNumber, 'cardNumber');
    const patron = createPatron(
      ctx.db,
      {
        cardNumber,
        name: requireString(req.body?.name, 'name'),
        email: requireString(req.body?.email, 'email'),
        cardType: requireOneOf(req.body?.cardType, 'cardType', ['adult', 'child', 'senior'] as const),
        homeBranch: getBranchByCode(ctx.db, requireString(req.body?.homeBranch, 'homeBranch')),
      },
      ctx.clock.now(),
    );
    res.status(201).json({ patron });
  });

  // A newly bought title and its copies. Prices are in dollars.
  router.post('/titles', (req, res) => {
    const copies: unknown[] = Array.isArray(req.body?.copies) ? req.body.copies : [];
    if (copies.length === 0) throw badRequest('invalid_field', 'copies must list at least one copy');
    const year = req.body?.publishedYear;
    res.status(201).json(
      addTitle(ctx, {
        isbn: typeof req.body?.isbn === 'string' ? req.body.isbn : null,
        title: requireString(req.body?.title, 'title'),
        author: requireString(req.body?.author, 'author'),
        publishedYear: year === undefined ? null : requireId(year, 'publishedYear'),
        format: requireOneOf(req.body?.format, 'format', ['book', 'audiobook', 'dvd'] as const),
        audience: requireOneOf(req.body?.audience, 'audience', ['adult', 'teen', 'children'] as const),
        replacementCost: requireAmount(req.body?.replacementCost, 'replacementCost'),
        copies: copies.map((copy, i) => {
          const fields = (copy ?? {}) as { barcode?: unknown; branch?: unknown };
          return {
            barcode: requireString(fields.barcode, `copies[${i}].barcode`),
            branch: getBranchByCode(ctx.db, requireString(fields.branch, `copies[${i}].branch`)),
          };
        }),
      }),
    );
  });

  router.get('/outbox', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 200);
    res.json({ emails: ctx.outbox.list(limit) });
  });

  router.get('/cache', (_req, res) => {
    res.json(ctx.availability.stats());
  });

  router.get('/clock', (_req, res) => {
    res.json({ now: ctx.clock.now().toISOString() });
  });

  // Local development only: move the server's clock, e.g. to reproduce a
  // bug that only happens at a certain time of day.
  router.post('/clock', (req, res) => {
    if (!ctx.config.allowClockOverride || !(ctx.clock instanceof OffsetClock)) {
      throw new HttpError(403, 'clock_locked', 'The clock can only be changed in local development');
    }
    if (req.body?.reset) ctx.clock.reset();
    else ctx.clock.set(requireString(req.body?.now, 'now'));
    res.json({ now: ctx.clock.now().toISOString() });
  });

  return router;
}
