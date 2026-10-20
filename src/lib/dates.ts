// Calendar dates (due dates, hold pickup deadlines, fine days) are stored as
// "date keys": YYYY-MM-DD strings. Date keys sort and compare correctly as
// plain strings, which the queries rely on.

export function toDateKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new RangeError(`Not a date key: ${key}`);
  }
  return new Date(`${key}T00:00:00Z`);
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

// Whole days from a to b. Positive when b is after a.
export function daysBetween(a: string, b: string): number {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function today(now: Date): string {
  return toDateKey(now);
}
