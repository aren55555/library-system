import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;
export type Param = SQLInputValue;

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  return db;
}

export function one<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: Db, sql: string, ...params: Param[]): { changes: number; id: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), id: Number(result.lastInsertRowid) };
}

// Runs fn inside a transaction. fn must be synchronous: node:sqlite is
// synchronous, and awaiting inside a transaction would let other requests
// run their statements inside it.
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
