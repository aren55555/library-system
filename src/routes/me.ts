import { Router } from 'express';
import { all } from '../db/connection.ts';
import { describeBalance, listFines, recordPayment } from '../fines/balance.ts';
import { cancelHold, listHolds, placeHold } from '../holds/place.ts';
import { renewLoan } from '../loans/renew.ts';
import { requireAmount, requireId, requireString } from '../lib/validate.ts';
import { getBranchByCode } from '../patrons/repo.ts';
import { requirePatron } from '../middleware/auth.ts';
import type { Ctx } from '../context.ts';
import type { Loan } from '../types.ts';

// The patron app: "My account".
export function meRouter(ctx: Ctx): Router {
  const router = Router();
  router.use(requirePatron(ctx));

  const openLoans = (patronId: number) =>
    all<Loan & { title: string; barcode: string }>(
      ctx.db,
      `SELECT l.*, t.title, c.barcode FROM loans l
       JOIN copies c ON c.id = l.copy_id JOIN titles t ON t.id = c.title_id
       WHERE l.patron_id = ? AND l.returned_at IS NULL ORDER BY l.due_date`,
      patronId,
    );

  router.get('/account', (req, res) => {
    const patron = req.patron!;
    res.json({
      patron: { name: patron.name, cardNumber: patron.card_number, cardType: patron.card_type },
      ...describeBalance(ctx, patron.id),
      loans: openLoans(patron.id),
      holds: listHolds(ctx, patron.id),
    });
  });

  router.get('/loans', (req, res) => {
    res.json({ loans: openLoans(req.patron!.id) });
  });

  router.post('/loans/:id/renew', (req, res) => {
    res.json({ loan: renewLoan(ctx, req.patron!.id, requireId(req.params.id, 'id')) });
  });

  router.get('/holds', (req, res) => {
    res.json({ holds: listHolds(ctx, req.patron!.id) });
  });

  router.post('/holds', async (req, res) => {
    const titleId = requireId(req.body?.titleId, 'titleId');
    const pickup = getBranchByCode(ctx.db, requireString(req.body?.pickupBranch, 'pickupBranch'));
    res.status(201).json({ hold: await placeHold(ctx, req.patron!.id, titleId, pickup.id) });
  });

  router.delete('/holds/:id', async (req, res) => {
    res.json({ hold: await cancelHold(ctx, req.patron!.id, requireId(req.params.id, 'id')) });
  });

  router.get('/fines', (req, res) => {
    res.json({ ...describeBalance(ctx, req.patron!.id), fines: listFines(ctx, req.patron!.id) });
  });

  router.post('/payments', (req, res) => {
    const amount = requireAmount(req.body?.amount, 'amount');
    res.status(201).json(recordPayment(ctx, req.patron!.id, amount, 'card'));
  });

  return router;
}
