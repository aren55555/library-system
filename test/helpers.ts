import { createApp, createContext } from '../src/app.ts';
import { FixedClock } from '../src/clock.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, run } from '../src/db/connection.ts';
import { getBranchByCode } from '../src/patrons/repo.ts';
import type { Ctx } from '../src/context.ts';
import type { Branch, CardType, Format } from '../src/types.ts';

export const STAFF = { 'x-staff-token': 'test-token', 'x-branch': 'NYC' };

export interface TestEnv {
  ctx: Ctx;
  clock: FixedClock;
  app: ReturnType<typeof createApp>;
  nyc: Branch;
  hnl: Branch;
  sfo: Branch;
}

// A fresh in-memory database with the three branches and nothing else.
// The clock starts at 1:00pm Eastern (New York City) on a Tuesday.
export function setup(start = '2026-03-03T18:00:00Z'): TestEnv {
  const config = { ...loadConfig({}), staffToken: 'test-token', emailLatencyMs: 0 };
  const clock = new FixedClock(start);
  const ctx = createContext(config, { db: openDb(':memory:'), clock });
  run(
    ctx.db,
    `INSERT INTO branches (id, code, name, timezone, opens_at, closes_at) VALUES
     (1, 'NYC', 'New York City Library', 'America/New_York', '09:00', '20:00'),
     (2, 'HNL', 'Honolulu Library', 'Pacific/Honolulu', '09:00', '21:00'),
     (3, 'SFO', 'San Francisco Library', 'America/Los_Angeles', '10:00', '18:00')`,
  );
  return {
    ctx,
    clock,
    app: createApp(ctx, { quiet: true }),
    nyc: getBranchByCode(ctx.db, 'NYC'),
    hnl: getBranchByCode(ctx.db, 'HNL'),
    sfo: getBranchByCode(ctx.db, 'SFO'),
  };
}

let nextCard = 1000;
let nextBarcode = 5000;

export function addPatron(env: TestEnv, cardType: CardType = 'adult', branch = env.nyc) {
  const card = String(nextCard++);
  const { id } = run(
    env.ctx.db,
    'INSERT INTO patrons (card_number, name, email, card_type, home_branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    card,
    `Patron ${card}`,
    `patron${card}@example.com`,
    cardType,
    branch.id,
    '2025-01-01T00:00:00Z',
  );
  return { id, card };
}

export function addTitle(
  env: TestEnv,
  options: { title?: string; format?: Format; cost?: number; copies?: Branch[] } = {},
) {
  const { id } = run(
    env.ctx.db,
    'INSERT INTO titles (isbn, title, author, published_year, format, audience, replacement_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
    null,
    options.title ?? 'The Test Book',
    'A. Author',
    2020,
    options.format ?? 'book',
    'adult',
    options.cost ?? 25,
  );
  const barcodes = (options.copies ?? [env.nyc]).map((branch) => {
    const barcode = String(nextBarcode++);
    run(
      env.ctx.db,
      "INSERT INTO copies (title_id, branch_id, barcode, status, updated_at) VALUES (?, ?, ?, 'available', ?)",
      id,
      branch.id,
      barcode,
      '2025-01-01T00:00:00Z',
    );
    return barcode;
  });
  return { id, barcodes };
}
