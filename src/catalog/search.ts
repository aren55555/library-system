import { all, one } from '../db/connection.ts';
import { notFound } from '../lib/errors.ts';
import type { BranchAvailability } from './availabilityCache.ts';
import type { Ctx } from '../context.ts';
import type { Title } from '../types.ts';

export interface SearchOptions {
  q: string;
  format?: string;
  audience?: string;
  page: number;
  pageSize: number;
}

export interface TitleResult extends Title {
  availability: BranchAvailability[];
}

function loadAvailability(ctx: Ctx, titleId: number): BranchAvailability[] {
  return all<BranchAvailability>(
    ctx.db,
    `SELECT b.code AS branch,
            SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END) AS available,
            COUNT(*) AS total
     FROM copies c JOIN branches b ON b.id = c.branch_id
     WHERE c.title_id = ? AND c.status != 'withdrawn'
     GROUP BY b.code
     ORDER BY b.id`,
    titleId,
  );
}

export function availabilityFor(ctx: Ctx, titleId: number): BranchAvailability[] {
  return ctx.availability.get(titleId, () => loadAvailability(ctx, titleId));
}

export function searchCatalog(ctx: Ctx, options: SearchOptions) {
  const where = ['(t.title LIKE ? OR t.author LIKE ? OR t.isbn = ?)'];
  const params: string[] = [`%${options.q}%`, `%${options.q}%`, options.q];
  if (options.format) {
    where.push('t.format = ?');
    params.push(options.format);
  }
  if (options.audience) {
    where.push('t.audience = ?');
    params.push(options.audience);
  }

  const total = one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM titles t WHERE ${where.join(' AND ')}`, ...params);
  const titles = all<Title>(
    ctx.db,
    `SELECT t.* FROM titles t WHERE ${where.join(' AND ')}
     ORDER BY t.title, t.id LIMIT ? OFFSET ?`,
    ...params,
    options.pageSize,
    (options.page - 1) * options.pageSize,
  );

  return {
    total: total?.n ?? 0,
    page: options.page,
    pageSize: options.pageSize,
    results: titles.map((title): TitleResult => ({ ...title, availability: availabilityFor(ctx, title.id) })),
  };
}

export function getTitleDetail(ctx: Ctx, titleId: number): TitleResult {
  const title = one<Title>(ctx.db, 'SELECT * FROM titles WHERE id = ?', titleId);
  if (!title) throw notFound('title_not_found', `No title with id ${titleId}`);
  return { ...title, availability: availabilityFor(ctx, title.id) };
}
