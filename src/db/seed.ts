// Builds a realistic sample database: three branches, a few thousand patrons,
// about 8,000 titles and 35,000 copies, with loan, hold and fine history.
//
//   npm run seed              reset data/stacks.db and fill it
//
// The output is the same every run for a given date.

import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AvailabilityCache } from '../catalog/availabilityCache.ts';
import { FixedClock } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { chargeOverdueThrough } from '../fines/accrue.ts';
import { placeHold } from '../holds/place.ts';
import { addDays, toDateKey } from '../lib/dates.ts';
import { checkout } from '../loans/checkout.ts';
import { LOAN_DAYS } from '../loans/policy.ts';
import { returnCopy } from '../loans/returns.ts';
import { createOutbox } from '../notify/outbox.ts';
import { getBranchByCode, getPatronByCard } from '../patrons/repo.ts';
import { all, one, openDb, run, type Db } from './connection.ts';
import type { Ctx } from '../context.ts';
import type { CardType, Format, Loan } from '../types.ts';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240611);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = ['Ada', 'Ben', 'Chloe', 'Dev', 'Elena', 'Felix', 'Grace', 'Hiro', 'Imani', 'Jonah', 'Kai', 'Lena', 'Malia', 'Noah', 'Olive', 'Pita', 'Quinn', 'Rosa', 'Sam', 'Tavita', 'Uma', 'Victor', 'Wren', 'Xavier', 'Yuki', 'Zara', 'Keoni', 'Mateo', 'Nadia', 'Owen', 'Priya', 'Rafael', 'Sofia', 'Theo', 'Leilani', 'Marcus'];
const LAST = ['Akana', 'Baker', 'Chen', 'Diaz', 'Evans', 'Fujita', 'Garcia', 'Hale', 'Ibrahim', 'Johnson', 'Kahananui', 'Lopez', 'Mendes', 'Nakamura', 'Olsen', 'Patel', 'Quintero', 'Reyes', 'Silva', 'Tanaka', 'Ueda', 'Vargas', 'Walker', 'Xu', 'Young', 'Zimmerman', 'Okafor', 'Kim', 'Novak', 'Shah'];
const ADJ = ['Silent', 'Hidden', 'Last', 'Broken', 'Golden', 'Paper', 'Winter', 'Salt', 'Iron', 'Glass', 'Quiet', 'Burning', 'Lost', 'Midnight', 'Wild', 'Northern', 'Little', 'Secret', 'Distant', 'Hollow'];
const NOUN = ['River', 'Garden', 'Kingdom', 'Orchard', 'Harbor', 'Library', 'Mountain', 'Lantern', 'Island', 'Road', 'Sky', 'House', 'Sea', 'Forest', 'Station', 'Bridge', 'Letter', 'Map', 'Clock', 'Fox'];
const KIDS = ['Bear', 'Bunny', 'Tugboat', 'Dragon', 'Moon', 'Duck', 'Robot', 'Kitten', 'Truck', 'Owl'];
const AUTHOR_FIRST = ['Amelia', 'Bruno', 'Carmen', 'Dmitri', 'Esther', 'Farid', 'Greta', 'Hector', 'Ines', 'Jasper', 'Keiko', 'Luis', 'Mira', 'Nikolai', 'Odette'];

interface SeedSummary {
  branches: number;
  patrons: number;
  titles: number;
  copies: number;
  loans: number;
  holds: number;
  fines: number;
}

export function seed(db: Db, now: Date): SeedSummary {
  const nowIso = now.toISOString();
  const todayKey = toDateKey(now);

  db.exec('BEGIN');
  // Branches. Copies float between them, so a title's copies can be anywhere.
  run(db, `INSERT INTO branches (id, code, name, timezone, opens_at, closes_at) VALUES
    (1, 'CDF', 'Cedar Falls Library', 'America/Los_Angeles', '09:00', '20:00'),
    (2, 'PRH', 'Prairie Hill Library', 'America/Chicago', '09:00', '21:00'),
    (3, 'KON', 'Kona Coast Library', 'Pacific/Honolulu', '10:00', '18:00')`);

  // Patrons. 2100xxxx cards are the named patrons from support tickets.
  const insertPatron = db.prepare(
    'INSERT INTO patrons (card_number, name, email, card_type, home_branch_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const named: [string, string, CardType, number][] = [
    ['21000101', 'Leilani Kahananui', 'adult', 3],
    ['21000102', 'Keoni Akana', 'senior', 3],
    ['21000201', 'Tom Walker', 'adult', 1],
    ['21000202', 'Daniel Reyes', 'adult', 1],
    ['21000208', 'Priya Shah', 'adult', 1],
    ['21000301', 'Grace Okafor', 'adult', 2],
    ['21000303', 'Maya Okafor', 'child', 2],
  ];
  for (const [card, name, type, branch] of named) {
    insertPatron.run(card, name, `${name.toLowerCase().replace(' ', '.')}@example.com`, type, branch, '2023-04-01T18:00:00.000Z');
  }
  for (let i = 0; i < 3000; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const roll = rand();
    const type: CardType = roll < 0.72 ? 'adult' : roll < 0.88 ? 'child' : 'senior';
    insertPatron.run(
      String(30000000 + i * 7),
      name,
      `${name.toLowerCase().replace(' ', '.')}.${i}@example.com`,
      type,
      between(1, 3),
      new Date(now.getTime() - between(30, 2000) * 86_400_000).toISOString(),
    );
  }
  const patronIds = all<{ id: number }>(db, 'SELECT id FROM patrons WHERE card_number >= ?', '3').map((p) => p.id);

  // Titles and copies.
  const insertTitle = db.prepare(
    'INSERT INTO titles (isbn, title, author, published_year, format, audience, replacement_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertCopy = db.prepare(
    'INSERT INTO copies (title_id, branch_id, barcode, status, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  let barcode = 39000000;
  const addCopies = (titleId: number, branches: number[]) => {
    for (const branch of branches) insertCopy.run(titleId, branch, String(barcode++), 'available', nowIso);
  };

  // Titles that appear in support tickets.
  const story = {
    saltRoad: Number(insertTitle.run('9780000000101', 'The Salt Road', 'Keiko Mendes', 2021, 'book', 'adult', 27.99).lastInsertRowid),
    lighthouse: Number(insertTitle.run('9780000000202', "The Lighthouse Keeper's Daughter", 'Esther Novak', 2024, 'book', 'adult', 28.5).lastInsertRowid),
    tugboat: Number(insertTitle.run('9780000000303', 'Goodnight, Little Tugboat', 'Mira Hale', 2019, 'book', 'children', 5).lastInsertRowid),
    tides: Number(insertTitle.run('9780000000404', 'Pacific Tides Field Guide', 'Luis Akana', 2018, 'book', 'adult', 34).lastInsertRowid),
  };
  addCopies(story.saltRoad, [3, 3, 1]);
  addCopies(story.lighthouse, [1]);
  addCopies(story.tugboat, [2]);
  addCopies(story.tides, [3, 3, 2]);

  for (let i = 0; i < 8000; i++) {
    const roll = rand();
    const format: Format = roll < 0.8 ? 'book' : roll < 0.92 ? 'audiobook' : 'dvd';
    const audience = format === 'dvd' ? 'adult' : pick(['adult', 'adult', 'adult', 'teen', 'children'] as const);
    const title =
      audience === 'children'
        ? `${pick(['Goodnight', 'Hello', 'Where Is', 'The Busy', 'Sleepy'])}, ${pick(ADJ)} ${pick(KIDS)}`
        : `The ${pick(ADJ)} ${pick(NOUN)}${rand() < 0.3 ? ` of ${pick(NOUN)}s` : ''}`;
    const cost =
      audience === 'children'
        ? pick([5, 5, 6.99, 7.99, 8.5, 12.99])
        : format === 'dvd'
          ? pick([14.99, 19.99, 24.99])
          : Number((between(1500, 3800) / 100).toFixed(2));
    const id = Number(
      insertTitle.run(
        String(9781000000000 + i * 13),
        title,
        `${pick(AUTHOR_FIRST)} ${pick(LAST)}`,
        between(1965, 2026),
        format,
        audience,
        cost,
      ).lastInsertRowid,
    );
    const copies = rand() < 0.15 ? between(6, 14) : between(1, 5);
    addCopies(id, Array.from({ length: copies }, () => between(1, 3)));
  }

  // Loan history. Returned loans go back up to a year; open loans are recent.
  const storyTitleIds = Object.values(story);
  const copies = all<{ id: number; title_id: number; branch_id: number; format: Format }>(
    db,
    `SELECT c.id, c.title_id, c.branch_id, t.format FROM copies c JOIN titles t ON t.id = c.title_id
     WHERE c.title_id NOT IN (${storyTitleIds.join(',')})`,
  );
  const insertLoan = db.prepare(
    `INSERT INTO loans (copy_id, patron_id, branch_id, checked_out_at, due_date, returned_at, renewals)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const lateLoans: number[] = [];
  const onLoan = new Set<number>();
  for (let i = 0; i < 18000; i++) {
    const copy = pick(copies);
    const open = i < 4500;
    if (open && onLoan.has(copy.id)) continue;
    const daysAgo = open ? between(0, 30) : between(31, 365);
    // Branch hours, roughly: checkouts happen during the local day.
    const out = new Date(now.getTime() - daysAgo * 86_400_000);
    out.setUTCHours(between(17, 23) + (copy.branch_id === 3 ? 3 : copy.branch_id === 2 ? -2 : 0), between(0, 59));
    const due = addDays(toDateKey(out), LOAN_DAYS[copy.format]);
    let returned: string | null = null;
    if (!open) {
      const keptDays = Math.max(1, LOAN_DAYS[copy.format] + between(-12, rand() < 0.15 ? 9 : 0));
      const back = new Date(out.getTime() + keptDays * 86_400_000);
      back.setUTCHours(between(17, 26) + (copy.branch_id === 3 ? 3 : 0), between(0, 59));
      returned = back.toISOString();
    }
    const id = Number(
      insertLoan.run(copy.id, pick(patronIds), copy.branch_id, out.toISOString(), due, returned, rand() < 0.1 ? 1 : 0).lastInsertRowid,
    );
    if (open) {
      onLoan.add(copy.id);
      run(db, "UPDATE copies SET status = 'on_loan' WHERE id = ?", copy.id);
    }
    if ((returned && toDateKey(new Date(returned)) > due) || (open && due < todayKey)) lateLoans.push(id);
  }

  // A small waiting list on popular titles that are fully checked out.
  const busy = all<{ title_id: number }>(
    db,
    `SELECT title_id FROM copies WHERE title_id NOT IN (${storyTitleIds.join(',')})
     GROUP BY title_id HAVING SUM(status = 'available') = 0 LIMIT 400`,
  );
  const insertHold = db.prepare(
    "INSERT INTO holds (title_id, patron_id, pickup_branch_id, status, placed_at) VALUES (?, ?, ?, 'waiting', ?)",
  );
  for (const { title_id } of busy) {
    for (let n = between(1, 4); n > 0; n--) {
      insertHold.run(title_id, pick(patronIds), between(1, 3), new Date(now.getTime() - between(1, 40) * 86_400_000).toISOString());
    }
  }
  db.exec('COMMIT');

  // Fines on late loans, charged the way the app charges them.
  const ctx = seedContext(db, now, 0);
  db.exec('BEGIN');
  for (const id of lateLoans) {
    const loan = one<Loan>(db, 'SELECT * FROM loans WHERE id = ?', id)!;
    const last = loan.returned_at ? toDateKey(new Date(loan.returned_at)) : todayKey;
    chargeOverdueThrough(ctx, loan, last);
  }
  db.exec('COMMIT');

  return { ...counts(db) };
}

function seedContext(db: Db, now: Date, emailLatencyMs: number) {
  const clock = new FixedClock(now.toISOString());
  const config = { ...loadConfig(), emailLatencyMs };
  const ctx: Ctx = {
    db,
    clock,
    config,
    outbox: createOutbox(db, clock, emailLatencyMs),
    availability: new AvailabilityCache(clock, 0),
  };
  return { ...ctx, clock };
}

function at(now: Date, daysAgo: number, utcTime: string): string {
  return `${toDateKey(new Date(now.getTime() - daysAgo * 86_400_000))}T${utcTime}Z`;
}

// Recreates what happened in the support tickets by running the real code.
export async function seedStories(db: Db, now: Date): Promise<void> {
  const ctx = seedContext(db, now, 40);
  const cdf = getBranchByCode(db, 'CDF');
  const kon = getBranchByCode(db, 'KON');
  const prh = getBranchByCode(db, 'PRH');
  const barcodeOf = (title: string, branchId: number) =>
    one<{ barcode: string }>(
      db,
      'SELECT c.barcode FROM copies c JOIN titles t ON t.id = c.title_id WHERE t.title = ? AND c.branch_id = ? ORDER BY c.id LIMIT 1',
      title,
      branchId,
    )!.barcode;

  // Leilani checks out The Salt Road at Kona Coast at 11:05am, and returns it
  // on the due date at 3:40pm, both local time.
  const saltRoad = barcodeOf('The Salt Road', kon.id);
  ctx.clock.set(at(now, 30, '21:05:00'));
  checkout(ctx, { cardNumber: '21000101', barcode: saltRoad, branch: kon });
  ctx.clock.set(at(now, 8, '01:40:00'));
  await returnCopy(ctx, saltRoad, kon);

  // Keoni, same branch, returns an item on its due date at 10:15am.
  const saltRoad2 = one<{ barcode: string }>(
    db,
    "SELECT c.barcode FROM copies c JOIN titles t ON t.id = c.title_id WHERE t.title = 'The Salt Road' AND c.branch_id = ? ORDER BY c.id DESC LIMIT 1",
    kon.id,
  )!.barcode;
  ctx.clock.set(at(now, 26, '20:30:00'));
  checkout(ctx, { cardNumber: '21000102', barcode: saltRoad2, branch: kon });
  ctx.clock.set(at(now, 5, '20:15:00'));
  await returnCopy(ctx, saltRoad2, kon);

  // Tom has the only copy of The Lighthouse Keeper's Daughter. Daniel places
  // a hold. Tom returns it at Cedar Falls at 2:15pm; while the "your hold is
  // ready" email is going out, Priya checks the same copy out at self-checkout.
  const lighthouse = barcodeOf("The Lighthouse Keeper's Daughter", cdf.id);
  ctx.clock.set(at(now, 20, '18:00:00'));
  checkout(ctx, { cardNumber: '21000201', barcode: lighthouse, branch: cdf });
  ctx.clock.set(at(now, 12, '04:30:00'));
  const lighthouseTitle = one<{ id: number }>(db, "SELECT id FROM titles WHERE title = 'The Lighthouse Keeper''s Daughter'")!.id;
  await placeHold(ctx, getPatronByCard(db, '21000202').id, lighthouseTitle, cdf.id);
  ctx.clock.set(at(now, 3, '21:15:00'));
  const returning = returnCopy(ctx, lighthouse, cdf);
  await new Promise((resolve) => setTimeout(resolve, 10));
  checkout(ctx, { cardNumber: '21000208', barcode: lighthouse, branch: cdf });
  await returning;

  // Two Kona Coast patrons place holds on Pacific Tides Field Guide, which
  // pulls both copies off the shelf there.
  const tidesTitle = one<{ id: number }>(db, "SELECT id FROM titles WHERE title = 'Pacific Tides Field Guide'")!.id;
  ctx.clock.set(at(now, 1, '22:10:00'));
  for (const id of patronsAt(db, kon.id, 2)) await placeHold(ctx, id, tidesTitle, kon.id);

  // Maya (child card) has had Goodnight, Little Tugboat ($5.00) for months.
  // The nightly job has charged her 10 cents a day.
  const tugboat = barcodeOf('Goodnight, Little Tugboat', prh.id);
  ctx.clock.set(at(now, 72, '19:00:00'));
  checkout(ctx, { cardNumber: '21000303', barcode: tugboat, branch: prh });
  const mayaLoan = one<Loan>(db, 'SELECT l.* FROM loans l JOIN copies c ON c.id = l.copy_id WHERE c.barcode = ?', tugboat)!;
  for (let daysAgo = 50; daysAgo >= 0; daysAgo--) {
    ctx.clock.set(at(now, daysAgo, '09:00:00'));
    chargeOverdueThrough(ctx, mayaLoan, toDateKey(ctx.clock.now()));
  }
}

function patronsAt(db: Db, branchId: number, limit: number): number[] {
  return all<{ id: number }>(
    db,
    "SELECT id FROM patrons WHERE home_branch_id = ? AND card_number >= '3' ORDER BY id LIMIT ?",
    branchId,
    limit,
  ).map((p) => p.id);
}

function counts(db: Db): SeedSummary {
  const n = (table: string) => one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)!.n;
  return {
    branches: n('branches'),
    patrons: n('patrons'),
    titles: n('titles'),
    copies: n('copies'),
    loans: n('loans'),
    holds: n('holds'),
    fines: n('fines'),
  };
}

export async function seedAll(db: Db, now: Date): Promise<SeedSummary> {
  seed(db, now);
  await seedStories(db, now);
  return counts(db);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
  const db = openDb(config.dbPath);
  const started = performance.now();
  const summary = await seedAll(db, config.fakeNow ? new Date(config.fakeNow) : new Date());
  console.log(`Seeded ${config.dbPath} in ${((performance.now() - started) / 1000).toFixed(1)}s`, summary);
}
