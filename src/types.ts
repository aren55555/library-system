export type CardType = 'adult' | 'child' | 'senior';
export type Format = 'book' | 'audiobook' | 'dvd';
export type CopyStatus = 'available' | 'on_loan' | 'on_hold_shelf' | 'lost' | 'withdrawn';
export type HoldStatus = 'waiting' | 'ready' | 'fulfilled' | 'expired' | 'cancelled';

export interface Branch {
  id: number;
  code: string;
  name: string;
  timezone: string;
  opens_at: string;
  closes_at: string;
}

export interface Patron {
  id: number;
  card_number: string;
  name: string;
  email: string;
  card_type: CardType;
  home_branch_id: number;
  created_at: string;
}

export interface Title {
  id: number;
  isbn: string | null;
  title: string;
  author: string;
  published_year: number | null;
  format: Format;
  audience: 'adult' | 'teen' | 'children';
  replacement_cost: number;
}

export interface Copy {
  id: number;
  title_id: number;
  branch_id: number;
  barcode: string;
  status: CopyStatus;
  updated_at: string;
}

export interface Loan {
  id: number;
  copy_id: number;
  patron_id: number;
  branch_id: number;
  checked_out_at: string;
  due_date: string;
  returned_at: string | null;
  renewals: number;
  reminder_sent_on: string | null;
}

export interface Hold {
  id: number;
  title_id: number;
  patron_id: number;
  pickup_branch_id: number;
  status: HoldStatus;
  copy_id: number | null;
  placed_at: string;
  ready_at: string | null;
  expires_on: string | null;
  closed_at: string | null;
}

export interface Fine {
  id: number;
  patron_id: number;
  loan_id: number | null;
  kind: 'overdue' | 'lost' | 'damage' | 'manual';
  amount: number;
  for_date: string | null;
  note: string | null;
  created_at: string;
  waived_at: string | null;
  waived_by: string | null;
}
