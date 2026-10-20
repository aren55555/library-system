import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeOverdueThrough } from '../src/fines/accrue.ts';
import { getBalance, recordPayment, waiveFine } from '../src/fines/balance.ts';
import { checkout } from '../src/loans/checkout.ts';
import { addPatron, addTitle, setup } from './helpers.ts';

test('overdue fines stop at the replacement cost', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env, { cost: 2 });
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  chargeOverdueThrough(env.ctx, loan, '2026-05-01');

  assert.equal(getBalance(env.ctx, patron.id), 2);
});

test('charging the same day twice only charges once', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });

  chargeOverdueThrough(env.ctx, loan, '2026-03-26');
  chargeOverdueThrough(env.ctx, loan, '2026-03-26');

  assert.equal(getBalance(env.ctx, patron.id), 0.5);
});

test('payments reduce the balance and cannot exceed it', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });
  chargeOverdueThrough(env.ctx, loan, '2026-03-28');

  assert.throws(() => recordPayment(env.ctx, patron.id, 5, 'card'), { code: 'overpayment' });
  assert.deepEqual(recordPayment(env.ctx, patron.id, 1, 'card'), { balance: 0, balanceDisplay: '$0' });
});

test('waived fines do not count toward the balance', () => {
  const env = setup();
  const patron = addPatron(env, 'senior');
  const book = addTitle(env);
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });
  const [first] = chargeOverdueThrough(env.ctx, loan, '2026-03-26');

  waiveFine(env.ctx, first.id, 'desk');

  assert.equal(getBalance(env.ctx, patron.id), 0.15);
});

test('accounts that owe more than $10 cannot check out', () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env, { cost: 50 });
  const loan = checkout(env.ctx, { cardNumber: patron.card, barcode: book.barcodes[0], branch: env.cdf });
  chargeOverdueThrough(env.ctx, loan, '2026-05-10'); // 47 days at $0.25

  const another = addTitle(env);
  assert.throws(
    () => checkout(env.ctx, { cardNumber: patron.card, barcode: another.barcodes[0], branch: env.cdf }),
    { code: 'account_blocked' },
  );
});
