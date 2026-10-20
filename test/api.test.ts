import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { addPatron, addTitle, setup, STAFF } from './helpers.ts';

test('catalog search shows availability by branch', async () => {
  const env = setup();
  addTitle(env, { title: 'The Quiet Harbor', copies: [env.cdf, env.cdf, env.kon] });

  const res = await request(env.app).get('/api/catalog/search?q=quiet harbor').expect(200);

  assert.equal(res.body.total, 1);
  assert.deepEqual(res.body.results[0].availability, [
    { branch: 'CDF', available: 2, total: 2 },
    { branch: 'KON', available: 1, total: 1 },
  ]);
});

test('availability updates after a checkout', async () => {
  const env = setup();
  const book = addTitle(env, { title: 'The Quiet Harbor' });
  await request(env.app).get('/api/catalog/search?q=quiet').expect(200);

  await request(env.app)
    .post('/api/desk/checkout')
    .set(STAFF)
    .send({ cardNumber: addPatron(env).card, barcode: book.barcodes[0] })
    .expect(201);

  const res = await request(env.app).get('/api/catalog/search?q=quiet').expect(200);
  assert.deepEqual(res.body.results[0].availability, [{ branch: 'CDF', available: 0, total: 1 }]);
});

test('desk checkout and return', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);

  const out = await request(env.app)
    .post('/api/desk/checkout')
    .set(STAFF)
    .send({ cardNumber: patron.card, barcode: book.barcodes[0] })
    .expect(201);
  assert.equal(out.body.loan.due_date, '2026-03-24');

  const back = await request(env.app).post('/api/desk/return').set(STAFF).send({ barcode: book.barcodes[0] }).expect(200);
  assert.deepEqual(back.body.finesCharged, []);
  assert.equal(back.body.hold, null);
});

test('patron account shows loans, holds and balance', async () => {
  const env = setup();
  const patron = addPatron(env);
  const book = addTitle(env);
  await request(env.app).post('/api/desk/checkout').set(STAFF).send({ cardNumber: patron.card, barcode: book.barcodes[0] });

  const res = await request(env.app).get('/api/me/account').set('x-card-number', patron.card).expect(200);

  assert.equal(res.body.loans.length, 1);
  assert.equal(res.body.balanceDisplay, '$0');
});

test('patrons can place holds from the app', async () => {
  const env = setup();
  const book = addTitle(env);

  const res = await request(env.app)
    .post('/api/me/holds')
    .set('x-card-number', addPatron(env).card)
    .send({ titleId: book.id, pickupBranch: 'cdf' })
    .expect(201);

  assert.equal(res.body.hold.status, 'ready');
});

test('requests without credentials are rejected', async () => {
  const env = setup();
  await request(env.app).get('/api/me/account').expect(401);
  await request(env.app).post('/api/desk/return').send({ barcode: '1' }).expect(401);
  await request(env.app).get('/api/me/account').set('x-card-number', 'nope').expect(401);
});

test('bad input is a 400, missing things are a 404', async () => {
  const env = setup();
  await request(env.app).get('/api/catalog/search?q=a').expect(400);
  await request(env.app).post('/api/desk/checkout').set(STAFF).send({}).expect(400);
  await request(env.app).post('/api/desk/return').set(STAFF).send({ barcode: 'missing' }).expect(404);
  await request(env.app).get('/api/catalog/titles/999').expect(404);
});
