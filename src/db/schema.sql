-- Stacks circulation schema. Applied on startup; every statement must be
-- safe to run more than once.

CREATE TABLE IF NOT EXISTS branches (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  timezone   TEXT NOT NULL,           -- IANA name, e.g. America/Los_Angeles
  opens_at   TEXT NOT NULL,           -- local HH:MM
  closes_at  TEXT NOT NULL            -- local HH:MM
);

CREATE TABLE IF NOT EXISTS patrons (
  id              INTEGER PRIMARY KEY,
  card_number     TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  card_type       TEXT NOT NULL CHECK (card_type IN ('adult', 'child', 'senior')),
  home_branch_id  INTEGER NOT NULL REFERENCES branches(id),
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS titles (
  id                INTEGER PRIMARY KEY,
  isbn              TEXT,
  title             TEXT NOT NULL,
  author            TEXT NOT NULL,
  published_year    INTEGER,
  format            TEXT NOT NULL CHECK (format IN ('book', 'audiobook', 'dvd')),
  audience          TEXT NOT NULL CHECK (audience IN ('adult', 'teen', 'children')),
  replacement_cost  REAL NOT NULL      -- dollars
);

CREATE TABLE IF NOT EXISTS copies (
  id          INTEGER PRIMARY KEY,
  title_id    INTEGER NOT NULL REFERENCES titles(id),
  branch_id   INTEGER NOT NULL REFERENCES branches(id),
  barcode     TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL CHECK (status IN ('available', 'on_loan', 'on_hold_shelf', 'lost', 'withdrawn')),
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id                INTEGER PRIMARY KEY,
  copy_id           INTEGER NOT NULL REFERENCES copies(id),
  patron_id         INTEGER NOT NULL REFERENCES patrons(id),
  branch_id         INTEGER NOT NULL REFERENCES branches(id),
  checked_out_at    TEXT NOT NULL,     -- ISO instant (UTC)
  due_date          TEXT NOT NULL,     -- YYYY-MM-DD, see src/lib/dates.ts
  returned_at       TEXT,              -- ISO instant (UTC)
  renewals          INTEGER NOT NULL DEFAULT 0,
  reminder_sent_on  TEXT               -- YYYY-MM-DD
);

CREATE INDEX IF NOT EXISTS loans_open ON loans (copy_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS loans_patron ON loans (patron_id);

CREATE TABLE IF NOT EXISTS holds (
  id                INTEGER PRIMARY KEY,
  title_id          INTEGER NOT NULL REFERENCES titles(id),
  patron_id         INTEGER NOT NULL REFERENCES patrons(id),
  pickup_branch_id  INTEGER NOT NULL REFERENCES branches(id),
  status            TEXT NOT NULL CHECK (status IN ('waiting', 'ready', 'fulfilled', 'expired', 'cancelled')),
  copy_id           INTEGER REFERENCES copies(id),
  placed_at         TEXT NOT NULL,
  ready_at          TEXT,
  expires_on        TEXT,              -- YYYY-MM-DD, last day to pick up
  closed_at         TEXT
);

CREATE INDEX IF NOT EXISTS holds_queue ON holds (title_id, status, placed_at);
CREATE INDEX IF NOT EXISTS holds_patron ON holds (patron_id);

CREATE TABLE IF NOT EXISTS fines (
  id          INTEGER PRIMARY KEY,
  patron_id   INTEGER NOT NULL REFERENCES patrons(id),
  loan_id     INTEGER REFERENCES loans(id),
  kind        TEXT NOT NULL CHECK (kind IN ('overdue', 'lost', 'damage', 'manual')),
  amount      REAL NOT NULL,           -- dollars
  for_date    TEXT,                    -- overdue fines: the day being charged
  note        TEXT,
  created_at  TEXT NOT NULL,
  waived_at   TEXT,
  waived_by   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS fines_one_per_day ON fines (loan_id, for_date) WHERE kind = 'overdue';
CREATE INDEX IF NOT EXISTS fines_patron ON fines (patron_id);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY,
  patron_id   INTEGER NOT NULL REFERENCES patrons(id),
  amount      REAL NOT NULL,           -- dollars
  method      TEXT NOT NULL CHECK (method IN ('card', 'cash')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id          INTEGER PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
