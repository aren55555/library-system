import express from 'express';
import { AvailabilityCache } from './catalog/availabilityCache.ts';
import { OffsetClock, type Clock } from './clock.ts';
import { openDb, type Db } from './db/connection.ts';
import { createOutbox } from './notify/outbox.ts';
import { errorHandler } from './middleware/errors.ts';
import { requestLog } from './middleware/requestLog.ts';
import { sameOriginOnly } from './middleware/sameOrigin.ts';
import { adminRouter } from './routes/admin.ts';
import { catalogRouter } from './routes/catalog.ts';
import { deskRouter } from './routes/desk.ts';
import { meRouter } from './routes/me.ts';
import { v1Router } from './routes/v1.ts';
import type { Config } from './config.ts';
import type { Ctx } from './context.ts';

export function createContext(config: Config, overrides: { db?: Db; clock?: Clock } = {}): Ctx {
  const db = overrides.db ?? openDb(config.dbPath);
  const clock = overrides.clock ?? new OffsetClock(config.fakeNow);
  return {
    db,
    clock,
    config,
    outbox: createOutbox(db, clock, config.emailLatencyMs),
    availability: new AvailabilityCache(clock, config.availabilityTtlMs),
  };
}

export function createApp(ctx: Ctx, options: { quiet?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  app.use(requestLog(options.quiet ?? false));
  app.use(sameOriginOnly());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', catalogRouter(ctx));
  app.use('/api/me', meRouter(ctx));
  app.use('/api/desk', deskRouter(ctx));
  app.use('/api/admin', adminRouter(ctx));
  app.use('/v1', v1Router(ctx));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such route' } });
  });
  app.use(errorHandler);
  return app;
}
