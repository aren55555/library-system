import type { CardType, Format } from '../types.ts';

// Circulation policy shared by all member libraries. Changes here need sign-off
// from the library services team.

export const LOAN_DAYS: Record<Format, number> = {
  book: 21,
  audiobook: 21,
  dvd: 7,
};

export const MAX_RENEWALS = 2;

export const MAX_ACTIVE_LOANS: Record<CardType, number> = {
  adult: 50,
  senior: 50,
  child: 20,
};

// Dollars per day overdue, per item.
export const DAILY_FINE: Record<CardType, number> = {
  adult: 0.25,
  senior: 0.15,
  child: 0.1,
};

// Patrons who owe more than this cannot check out or place holds.
export const BLOCK_THRESHOLD = 10;

export const MAX_ACTIVE_HOLDS = 15;

// Days a patron has to pick up a hold once it is ready.
export const HOLD_PICKUP_DAYS = 7;
