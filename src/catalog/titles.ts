import { one, run, tx } from '../db/connection.ts';
import { conflict } from '../lib/errors.ts';
import type { Ctx } from '../context.ts';
import type { Branch, Copy, Format, Title } from '../types.ts';

export interface NewTitle {
  isbn: string | null;
  title: string;
  author: string;
  publishedYear: number | null;
  format: Format;
  audience: Title['audience'];
  replacementCost: number;
  copies: { barcode: string; branch: Branch }[];
}

// Catalogs a new title with its copies, all on the shelf.
export function addTitle(ctx: Ctx, input: NewTitle): { title: Title; copies: Copy[] } {
  return tx(ctx.db, () => {
    const now = ctx.clock.now().toISOString();
    const { id } = run(
      ctx.db,
      `INSERT INTO titles (isbn, title, author, published_year, format, audience, replacement_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.isbn,
      input.title,
      input.author,
      input.publishedYear,
      input.format,
      input.audience,
      input.replacementCost,
    );
    const copies = input.copies.map(({ barcode, branch }) => {
      if (one(ctx.db, 'SELECT id FROM copies WHERE barcode = ?', barcode)) {
        throw conflict('duplicate_barcode', `Barcode ${barcode} is already in use`);
      }
      const copy = run(
        ctx.db,
        "INSERT INTO copies (title_id, branch_id, barcode, status, updated_at) VALUES (?, ?, ?, 'available', ?)",
        id,
        branch.id,
        barcode,
        now,
      );
      return one<Copy>(ctx.db, 'SELECT * FROM copies WHERE id = ?', copy.id)!;
    });
    return { title: one<Title>(ctx.db, 'SELECT * FROM titles WHERE id = ?', id)!, copies };
  });
}
