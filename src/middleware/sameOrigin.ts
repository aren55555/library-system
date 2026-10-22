import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors.ts';

// Browsers send an Origin header on every cross-origin request, including CORS
// preflights. Requests without one (curl, server to server) are not browser
// cross-origin requests, so they pass.
export function sameOriginOnly() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (origin !== undefined && origin !== `${req.protocol}://${req.header('host')}`) {
      return next(forbidden('cross_origin', `Requests from ${origin} are not allowed`));
    }
    next();
  };
}
