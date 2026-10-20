// All code reads the time through a Clock so tests and local debugging can
// control it. Never call `new Date()` for "now" outside this file.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

// A clock that starts at a given instant and then moves forward in real time.
// Used by the dev server when FAKE_NOW is set, and by POST /api/admin/clock.
export class OffsetClock implements Clock {
  private offsetMs = 0;

  constructor(start?: string) {
    if (start) this.set(start);
  }

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  set(iso: string): void {
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) {
      throw new Error(`Invalid clock time: ${iso}`);
    }
    this.offsetMs = target.getTime() - Date.now();
  }

  reset(): void {
    this.offsetMs = 0;
  }
}

// A clock that only moves when told to. Used by tests.
export class FixedClock implements Clock {
  private current: Date;

  constructor(iso: string) {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  advanceDays(days: number): void {
    this.advanceMinutes(days * 24 * 60);
  }
}
