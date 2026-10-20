import { Router } from 'express';
import { all } from '../db/connection.ts';
import { describeBalance, listFines, recordPayment, waiveFine } from '../fines/balance.ts';
import { holdShelf } from '../holds/shelf.ts';
import { checkout } from '../loans/checkout.ts';
import { returnCopy } from '../loans/returns.ts';
import { requireAmount, requireId, requireString } from '../lib/validate.ts';
import { getPatronByCard } from '../patrons/repo.ts';
import { requireStaff } from '../middleware/auth.ts';
import type { Ctx } from '../context.ts';
import type { Loan } from '../types.ts';

// The circulation desk: staff terminals and self-checkout machines.
export function deskRouter(ctx: Ctx): Router {
  const router = Router();
  router.use(requireStaff(ctx));

  router.post('/checkout', (req, res) => {
    const loan = checkout(ctx, {
      cardNumber: requireString(req.body?.cardNumber, 'cardNumber'),
      barcode: requireString(req.body?.barcode, 'barcode'),
      branch: req.staff!.branch,
    });
    res.status(201).json({ loan });
  });

  router.post('/return', async (req, res) => {
    res.json(await returnCopy(ctx, requireString(req.body?.barcode, 'barcode'), req.staff!.branch));
  });

  router.get('/patrons/:card', (req, res) => {
    const patron = getPatronByCard(ctx.db, req.params.card);
    const loans = all<Loan>(
      ctx.db,
      'SELECT * FROM loans WHERE patron_id = ? ORDER BY checked_out_at DESC LIMIT 50',
      patron.id,
    );
    res.json({ patron, ...describeBalance(ctx, patron.id), loans, fines: listFines(ctx, patron.id) });
  });

  router.post('/patrons/:card/payments', (req, res) => {
    const patron = getPatronByCard(ctx.db, req.params.card);
    res.status(201).json(recordPayment(ctx, patron.id, requireAmount(req.body?.amount, 'amount'), 'cash'));
  });

  router.post('/fines/:id/waive', (req, res) => {
    res.json({ fine: waiveFine(ctx, requireId(req.params.id, 'id'), req.staff!.name) });
  });

  router.get('/hold-shelf', (req, res) => {
    res.json({ branch: req.staff!.branch.code, items: holdShelf(ctx, req.staff!.branch.id) });
  });

  return router;
}
