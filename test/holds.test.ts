import { test } from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../src/db/connection.ts';
import { cancelHold, listHolds, placeHold } from '../src/holds/place.ts';
import { checkout } from '../src/loans/checkout.ts';
import { returnCopy } from '../src/loans/returns.ts';
import { addPatron, addTitle, setup } from './helpers.ts';
import type { Copy } from '../src/types.ts';

const copyStatus = (env: ReturnType<typeof setup>, barcode: string) =>
  one<Copy>(env.ctx.db, 'SELECT * FROM copies WHERE barcode = ?', barcode)!.status;

test('a hold on a title that is on the shelf is ready right away', async () => {
  const env = setup();
  const book = addTitle(env);

  const hold = await placeHold(env.ctx, addPatron(env).id, book.id, env.nyc.id);

  assert.equal(hold.status, 'ready');
  assert.equal(hold.expires_on, '2026-03-10');
  assert.equal(copyStatus(env, book.barcodes[0]), 'on_hold_shelf');
  assert.equal(env.ctx.outbox.list().length, 1);
});

test('a returned copy goes to the first patron in line', async () => {
  const env = setup();
  const book = addTitle(env);
  checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.nyc });
  const first = addPatron(env);
  const second = addPatron(env);
  await placeHold(env.ctx, first.id, book.id, env.nyc.id);
  env.clock.advanceMinutes(5);
  await placeHold(env.ctx, second.id, book.id, env.nyc.id);

  const result = await returnCopy(env.ctx, book.barcodes[0], env.nyc);

  assert.equal(result.hold?.patron_id, first.id);
  assert.equal(copyStatus(env, book.barcodes[0]), 'on_hold_shelf');
  assert.equal(listHolds(env.ctx, second.id)[0].position, 1);
});

test('only the patron the hold is for can check out a copy on the hold shelf', async () => {
  const env = setup();
  const book = addTitle(env);
  const waiting = addPatron(env);
  await placeHold(env.ctx, waiting.id, book.id, env.nyc.id);

  assert.throws(
    () => checkout(env.ctx, { cardNumber: addPatron(env).card, barcode: book.barcodes[0], branch: env.nyc }),
    { code: 'on_hold_for_another_patron' },
  );
  const loan = checkout(env.ctx, { cardNumber: waiting.card, barcode: book.barcodes[0], branch: env.nyc });
  assert.equal(loan.patron_id, waiting.id);
  assert.equal(listHolds(env.ctx, waiting.id)[0].status, 'fulfilled');
});

test('cancelling a ready hold passes the copy to the next patron', async () => {
  const env = setup();
  const book = addTitle(env);
  const first = addPatron(env);
  const second = addPatron(env);
  const hold = await placeHold(env.ctx, first.id, book.id, env.nyc.id);
  env.clock.advanceMinutes(1);
  await placeHold(env.ctx, second.id, book.id, env.nyc.id);

  await cancelHold(env.ctx, first.id, hold.id);

  assert.equal(listHolds(env.ctx, second.id)[0].status, 'ready');
});

test('a patron cannot hold the same title twice', async () => {
  const env = setup();
  const book = addTitle(env);
  const patron = addPatron(env);
  await placeHold(env.ctx, patron.id, book.id, env.nyc.id);

  await assert.rejects(placeHold(env.ctx, patron.id, book.id, env.nyc.id), { code: 'duplicate_hold' });
});
