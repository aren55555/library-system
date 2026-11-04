# Stacks circulation

Stacks is a hosted system that small public libraries use to run their front desks. This repository is its circulation service: the part that handles checkouts, returns, renewals, holds (a patron's place in line for a book) and fines. It serves three member libraries in three time zones: New York City, Honolulu and San Francisco.

Patrons and library staff have reported some problems. They are in [TICKETS.md](TICKETS.md). The reports are written by patrons and desk staff, not engineers, so part of the job is working out what is actually wrong and what the right behavior should be.

## Setup

You need Node.js 26 or newer. Check with `node --version`. If it prints `v26` or higher, skip ahead to "Run it".

### Installing Node.js 26

**macOS.** Either download the macOS installer (`.pkg`) for v26 from <https://nodejs.org/en/download> and run it, or use nvm, a Node version manager:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
# Open a new terminal, then:
nvm install 26
```

**Windows.** Download the Windows installer (`.msi`) for v26 from <https://nodejs.org/en/download>, run it with the default options, then open a new terminal. The commands in this README are written for a Unix-style shell (bash or zsh), so run them in Git Bash, which comes with [Git for Windows](https://git-scm.com/downloads/win). If you work in WSL (Windows Subsystem for Linux), follow the Linux steps inside WSL instead.

**Linux.** Distribution packages are often older than v26, so use nvm:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
# Open a new terminal, then:
nvm install 26
```

### Run it

```sh
npm install
npm test          # 34 tests, all passing
npm start         # http://localhost:3000, seeds sample data on first run
```

`npm run seed` resets the sample database (`data/stacks.db`) to a fresh state. The sample data includes the patrons and items named in the tickets. You can inspect the database with any SQLite client, for example `sqlite3 data/stacks.db`.

## Using the API

There is no UI. Requests identify the caller with headers.

- **Patron app** routes (`/api/me/...`) need `X-Card-Number: <card number>`.
- **Desk and admin** routes (`/api/desk/...`, `/api/admin/...`) need `X-Staff-Token: desk-dev-token` and `X-Branch: <NYC | HNL | SFO>`, the branch the terminal is in.

```sh
# Search the catalog
curl 'localhost:3000/api/catalog/search?q=salt+road'

# A patron's account
curl localhost:3000/api/me/account -H 'X-Card-Number: 21000101'

# Check out and return at the San Francisco desk
DESK=(-H 'X-Staff-Token: desk-dev-token' -H 'X-Branch: SFO' -H 'Content-Type: application/json')
curl "${DESK[@]}" -X POST localhost:3000/api/desk/checkout -d '{"cardNumber":"21000102","barcode":"39000001"}'
curl "${DESK[@]}" -X POST localhost:3000/api/desk/return -d '{"barcode":"39000001"}'

# Emails the system would have sent
curl "${DESK[@]}" localhost:3000/api/admin/outbox

# Run the nightly job (fines, reminders, expired holds)
curl "${DESK[@]}" -X POST localhost:3000/api/admin/jobs/nightly
```

### Controlling the clock

All code reads the time through `src/clock.ts`. In local development you can move the server's clock:

```sh
curl "${DESK[@]}" -X POST localhost:3000/api/admin/clock -d '{"now":"2026-03-24T01:30:00Z"}'
curl "${DESK[@]}" -X POST localhost:3000/api/admin/clock -d '{"reset":true}'
```

You can also start the server at a given time with `FAKE_NOW=2026-03-24T01:30:00Z npm start`. Tests use `FixedClock`; see `test/helpers.ts`.

### Sharing your server

To let someone else reach the server you are running, leave `npm start` running, and in a second terminal run:

```sh
npm run share
```

It asks for a passphrase, agreed with the person you are sharing with, then prints a temporary public address and a QR code for it. Only requests that carry the passphrase get through. Press Ctrl+C to stop sharing.

There is nothing to sign up for or install. The tunnel goes through [localhost.run](https://localhost.run), or [Pinggy](https://pinggy.io) if your network blocks that, using the `ssh` command that comes with macOS, Linux and Windows 10 or newer.

## Project layout

```
src/
  app.ts, server.ts     App wiring and entry point
  clock.ts, config.ts   Time and settings
  db/                   Schema, query helpers, sample data
  catalog/              Search and availability counts
  loans/                Checkout, return, renew, circulation policy
  holds/                Placing, cancelling and filling holds
  fines/                Charging fines, balances, payments
  jobs/                 The nightly job
  notify/               Email outbox and templates
  routes/               HTTP routes (v1.ts is deprecated)
  lib/                  Shared helpers
test/                   node:test and supertest
```

## How we work

- Use any AI tools you like.
- Explain your reasoning as you go: what you ask the AI and why, and what you think of what it gives back.
- You own the output. Read and check what the AI writes before you rely on it.
- Ask questions, especially about how the library wants things to behave, rather than guessing.
- Add tests for what you fix. Keep the existing tests passing.

Finding the real problem behind a ticket matters more than closing many of them.
