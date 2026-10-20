import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.ts';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
