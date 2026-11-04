import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.ts';
import { findPatronByCard, getBranchByCode } from '../patrons/repo.ts';
import type { Ctx } from '../context.ts';
import type { Branch, Patron } from '../types.ts';

declare module 'express-serve-static-core' {
  interface Request {
    patron?: Patron;
    staff?: { name: string; branch: Branch };
  }
}

// Patron app requests identify the patron by library card number. (The real
// deployment puts this behind the identity provider; the header is set by the
// gateway.)
export function requirePatron(ctx: Ctx) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const card = req.header('x-card-number');
    const patron = card ? findPatronByCard(ctx.db, card) : undefined;
    if (!patron) return next(new HttpError(401, 'unauthenticated', 'Missing or unknown X-Card-Number header'));
    req.patron = patron;
    next();
  };
}

// Desk and admin requests come from staff terminals, which send a shared token
// and the code of the branch the terminal is in.
export function requireStaff(ctx: Ctx) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.header('x-staff-token') !== ctx.config.staffToken) {
      return next(new HttpError(401, 'unauthenticated', 'Missing or wrong X-Staff-Token header'));
    }
    const code = req.header('x-branch');
    if (!code) return next(new HttpError(400, 'missing_branch', 'Staff requests need an X-Branch header'));
    req.staff = { name: req.header('x-staff-name') ?? 'desk', branch: getBranchByCode(ctx.db, code) };
    next();
  };
}
