import type { Clock } from './clock.ts';
import type { Config } from './config.ts';
import type { Db } from './db/connection.ts';
import type { AvailabilityCache } from './catalog/availabilityCache.ts';
import type { Outbox } from './notify/outbox.ts';

// Everything a request handler or job needs. Built once in server.ts (or per
// test) and passed down explicitly.
export interface Ctx {
  db: Db;
  clock: Clock;
  config: Config;
  outbox: Outbox;
  availability: AvailabilityCache;
}
