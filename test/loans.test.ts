import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBalance } from '../src/fines/balance.ts';
import { placeHold } from '../src/holds/place.ts';
import { checkout } from '../src/loans/checkout.ts';
import { renewLoan } from '../src/loans/renew.ts';
import { returnCopy } from '../src/loans/returns.ts';
import { addPatron, addTitle, setup } from './helpers.ts';

test('checkout sets the due date 21 days out for books and 7 for DVDs', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const dvd = addTitle(env, { format: 'dvd' });

  const bookLoan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });
  const dvdLoan = checkout(env.ctx, { cardNumber: patron.card, barcode: dvd.barcodes[0], branch: env.cdf });

  assert.equal(bookLoan.due_date, '2026-03-24');
  assert.equal(dvdLoan.due_date, '2026-03-10');
});

test('a copy cannot be checked out twice', () => {
  const env = setup();
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.cdf });

  assert.throws(
    () => checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.cdf }),
    { code: 'copy_unavailable' },
  );
});

test('a copy must be checked out at the branch it is at', () => {
  const env = setup();
  const book = addTitle(env, { copies: [env.prh] });

  assert.throws(
    () => checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.cdf }),
    { code: 'wrong_branch' },
  );
});

test('returning on time charges nothing', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  env.clock.set('2026-03-24T17:30:00Z'); // due date, 10:30am Pacific
  const result = await returnCopy(env.ctx, book.barcodes[0], env.cdf);

  assert.deepEqual(result.finesCharged, []);
  assert.equal(getBalance(env.ctx, patron.id), 0);
});

test('returning late charges the daily fine for each day late', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  env.clock.set('2026-03-27T18:00:00Z'); // three days after the due date
  const result = await returnCopy(env.ctx, book.barcodes[0], env.cdf);

  assert.equal(result.finesCharged.length, 3);
  assert.equal(getBalance(env.ctx, patron.id), 0.75);
});

test('a copy returned to another branch moves to that branch', async () => {
  const env = setup();
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.cdf });

  await returnCopy(env.ctx, book.barcodes[0], env.prh);

  const loan = checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.prh });
  assert.equal(loan.branch_id, env.prh.id);
});

test('renewing extends from the current due date', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  env.clock.set('2026-03-20T18:00:00Z');
  const renewed = renewLoan(env.ctx, patron.id, loan.id);

  assert.equal(renewed.due_date, '2026-04-14');
  assert.equal(renewed.renewals, 1);
});

test('an overdue loan renews from today', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  env.clock.set('2026-03-30T18:00:00Z');
  assert.equal(renewLoan(env.ctx, patron.id, loan.id).due_date, '2026-04-20');
});

test('renewals are limited', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  renewLoan(env.ctx, patron.id, loan.id);
  renewLoan(env.ctx, patron.id, loan.id);
  assert.throws(() => renewLoan(env.ctx, patron.id, loan.id), { code: 'renewal_limit' });
});

test('a loan cannot be renewed while someone is waiting for the title', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });
  await placeHold(env.ctx, addPatron(env).id, book.id, env.cdf.id);

  assert.throws(() => renewLoan(env.ctx, patron.id, loan.id), { code: 'holds_waiting' });
});
