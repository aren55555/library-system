import type { Clock } from '../clock.ts';

export interface BranchAvailability {
  branch: string;
  available: number;
  total: number;
}

interface Entry {
  value: BranchAvailability[];
  expiresAt: number;
}

// Search results show per-branch availability for every title on the page,
// which used to be the slowest part of the catalog. Counts are cached per
// title. Anything that changes a copy's status must invalidate its title.
export class AvailabilityCache {
  private readonly entries = new Map<number, Entry>();
  private readonly clock: Clock;
  private readonly ttlMs: number;
  hits = 0;
  misses = 0;

  constructor(clock: Clock, ttlMs: number) {
    this.clock = clock;
    this.ttlMs = ttlMs;
  }

  get(titleId: number, load: () => BranchAvailability[]): BranchAvailability[] {
    const now = this.clock.now().getTime();
    const entry = this.entries.get(titleId);
    if (entry && entry.expiresAt > now) {
      this.hits++;
      return entry.value;
    }
    this.misses++;
    const value = load();
    this.entries.set(titleId, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  invalidate(titleId: number): void {
    this.entries.delete(titleId);
  }

  clear(): void {
    this.entries.clear();
  }

  stats() {
    return { size: this.entries.size, hits: this.hits, misses: this.misses };
  }
}
