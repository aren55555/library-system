import { all, one, run, tx } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { formatMoney, sum } from '../lib/money.ts';
import type { Ctx } from '../context.ts';
import type { Fine } from '../types.ts';

export function getBalance(ctx: Ctx, patronId: number): number {
  const fines = all<{ amount: number }>(
    ctx.db,
    'SELECT amount FROM fines WHERE patron_id = ? AND waived_at IS NULL',
    patronId,
  );
  const payments = all<{ amount: number }>(ctx.db, 'SELECT amount FROM payments WHERE patron_id = ?', patronId);
  return sum(fines.map((f) => f.amount)) - sum(payments.map((p) => p.amount));
}

export function describeBalance(ctx: Ctx, patronId: number) {
  const balance = getBalance(ctx, patronId);
  return { balance, balanceDisplay: formatMoney(balance) };
}

export function listFines(ctx: Ctx, patronId: number): Fine[] {
  return all<Fine>(ctx.db, 'SELECT * FROM fines WHERE patron_id = ? ORDER BY created_at DESC, id DESC', patronId);
}

export function recordPayment(ctx: Ctx, patronId: number, amount: number, method: 'card' | 'cash') {
  return tx(ctx.db, () => {
    const balance = getBalance(ctx, patronId);
    if (balance <= 0) throw conflict('nothing_owed', 'This account has no balance to pay');
    if (amount > balance) {
      throw badRequest('overpayment', `Payment of ${formatMoney(amount)} is more than the balance of ${formatMoney(balance)}`);
    }
    run(
      ctx.db,
      'INSERT INTO payments (patron_id, amount, method, created_at) VALUES (?, ?, ?, ?)',
      patronId,
      amount,
      method,
      ctx.clock.now().toISOString(),
    );
    return describeBalance(ctx, patronId);
  });
}

export function waiveFine(ctx: Ctx, fineId: number, staffName: string): Fine {
  const fine = one<Fine>(ctx.db, 'SELECT * FROM fines WHERE id = ?', fineId);
  if (!fine) throw notFound('fine_not_found', `No fine with id ${fineId}`);
  if (fine.waived_at) throw conflict('already_waived', 'This fine was already waived');
  run(
    ctx.db,
    'UPDATE fines SET waived_at = ?, waived_by = ? WHERE id = ?',
    ctx.clock.now().toISOString(),
    staffName,
    fineId,
  );
  return { ...fine, waived_at: ctx.clock.now().toISOString(), waived_by: staffName };
}
