import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
/** Every product photo is its own request, so downloads get a roomier limit than the shopper one. */
export const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
/** Requests that do not count toward the shopper limit: PayFast callbacks, and photo downloads (limited above). */
export const skipsShopperLimit = (method: string, path: string) =>
  path === '/payfast/notify' || (method === 'GET' && path.startsWith('/images/'));
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
export const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req, res)).catch(next);
