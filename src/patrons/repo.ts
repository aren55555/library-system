import { all, one, type Db } from '../db/connection.ts';
import { notFound } from '../lib/errors.ts';
import type { Branch, Copy, Patron, Title } from '../types.ts';

export function findPatronByCard(db: Db, cardNumber: string): Patron | undefined {
  return one<Patron>(db, 'SELECT * FROM patrons WHERE card_number = ?', cardNumber);
}

export function getPatron(db: Db, id: number): Patron {
  const patron = one<Patron>(db, 'SELECT * FROM patrons WHERE id = ?', id);
  if (!patron) throw notFound('patron_not_found', `No patron with id ${id}`);
  return patron;
}

export function getPatronByCard(db: Db, cardNumber: string): Patron {
  const patron = findPatronByCard(db, cardNumber);
  if (!patron) throw notFound('patron_not_found', `No patron with card ${cardNumber}`);
  return patron;
}

export function listBranches(db: Db): Branch[] {
  return all<Branch>(db, 'SELECT * FROM branches ORDER BY id');
}

export function getBranch(db: Db, id: number): Branch {
  const branch = one<Branch>(db, 'SELECT * FROM branches WHERE id = ?', id);
  if (!branch) throw notFound('branch_not_found', `No branch with id ${id}`);
  return branch;
}

export function getBranchByCode(db: Db, code: string): Branch {
  const branch = one<Branch>(db, 'SELECT * FROM branches WHERE code = ?', code.toUpperCase());
  if (!branch) throw notFound('branch_not_found', `No branch with code ${code}`);
  return branch;
}

export function getTitle(db: Db, id: number): Title {
  const title = one<Title>(db, 'SELECT * FROM titles WHERE id = ?', id);
  if (!title) throw notFound('title_not_found', `No title with id ${id}`);
  return title;
}

export function getCopy(db: Db, id: number): Copy {
  const copy = one<Copy>(db, 'SELECT * FROM copies WHERE id = ?', id);
  if (!copy) throw notFound('copy_not_found', `No copy with id ${id}`);
  return copy;
}

export function getCopyByBarcode(db: Db, barcode: string): Copy {
  const copy = one<Copy>(db, 'SELECT * FROM copies WHERE barcode = ?', barcode);
  if (!copy) throw notFound('copy_not_found', `No copy with barcode ${barcode}`);
  return copy;
}
