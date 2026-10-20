import type { NextFunction, Request, Response } from 'express';

export function requestLog(quiet: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (quiet) return next();
    const started = performance.now();
    res.on('finish', () => {
      const ms = (performance.now() - started).toFixed(1);
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}
