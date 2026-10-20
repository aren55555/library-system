import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBalance } from '../src/fines/balance.ts';
import { listHolds, placeHold } from '../src/holds/place.ts';
import { runNightly } from '../src/jobs/nightly.ts';
import { checkout } from '../src/loans/checkout.ts';
import { addPatron, addTitle, setup } from './helpers.ts';

test('the nightly job charges overdue fines and catches up missed days', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  env.clock.set('2026-03-26T09:00:00Z');
  const summary = await runNightly(env.ctx);

  assert.equal(summary.finesCharged, 2);
  assert.equal(getBalance(env.ctx, patron.id), 0.5);
});

test('the nightly job sends one due-tomorrow reminder per patron', async () => {
  const env = setup();
  const patron = addPatron(env);
  for (const title of [addTitle(env), addTitle(env)]) {
    checkout(env.ctx, { cardNumber: patron.card, barcode: title.barcodes[0], branch: env.cdf });
  }

  env.clock.set('2026-03-23T09:00:00Z');
  assert.equal((await runNightly(env.ctx)).remindersSent, 1);
  assert.equal((await runNightly(env.ctx)).remindersSent, 0);
});

test('the nightly job expires ready holds and passes the copy on', async () => {
  const env = setup();
  const book = addTitle(env);
  const first = addPatron(env);
  const second = addPatron(env);
  await placeHold(env.ctx, first.id, book.id, env.cdf.id);
  env.clock.advanceMinutes(1);
  await placeHold(env.ctx, second.id, book.id, env.cdf.id);

  env.clock.set('2026-03-11T09:00:00Z');
  const summary = await runNightly(env.ctx);

  assert.equal(summary.holdsExpired, 1);
  assert.equal(summary.holdsReassigned, 1);
  assert.equal(listHolds(env.ctx, first.id)[0].status, 'expired');
  assert.equal(listHolds(env.ctx, second.id)[0].status, 'ready');
});
