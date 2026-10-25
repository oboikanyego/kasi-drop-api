import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
export const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req, res)).catch(next);
