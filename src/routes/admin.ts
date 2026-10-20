import { Router } from 'express';
import { OffsetClock } from '../clock.ts';
import { HttpError } from '../lib/errors.ts';
import { requireString } from '../lib/validate.ts';
import { runNightly } from '../jobs/nightly.ts';
import { requireStaff } from '../middleware/auth.ts';
import type { Ctx } from '../context.ts';

export function adminRouter(ctx: Ctx): Router {
  const router = Router();
  router.use(requireStaff(ctx));

  router.post('/jobs/nightly', async (_req, res) => {
    res.json(await runNightly(ctx));
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
