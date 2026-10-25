import type { Express } from 'express';
import { z } from 'zod';
import { UserModel } from '../models.js';
import { HttpError } from '../http-error.js';
import { guard, identity } from '../accounts.js';
import { activeProduct, productsById } from '../catalogue-store.js';
import { safe } from '../http.js';
import { demo, demoFavorites } from '../state.js';

const favoriteIdSchema = z.string().min(1).max(120);
const favoritesMergeSchema = z.object({ productIds: z.array(favoriteIdSchema).max(100) });
async function accountFavorites(userId: string): Promise<string[]> {
  if (demo) return [...(demoFavorites.get(userId) || [])];
  const account = await UserModel.findById(userId).select('favoriteProductIds').lean();
  if (!account) throw new HttpError(401, 'Sign in required');
  return (account.favoriteProductIds || []) as string[];
}
async function setFavorite(userId: string, productId: string, enabled: boolean): Promise<string[]> {
  if (demo) {
    const ids = new Set(demoFavorites.get(userId) || []);
    if (enabled) ids.add(productId);
    else ids.delete(productId);
    const updated = [...ids];
    demoFavorites.set(userId, updated);
    return updated;
  }
  const update = enabled
    ? { $addToSet: { favoriteProductIds: productId } }
    : { $pull: { favoriteProductIds: productId } };
  const account = await UserModel.findByIdAndUpdate(userId, update, { new: true })
    .select('favoriteProductIds')
    .lean();
  if (!account) throw new HttpError(401, 'Sign in required');
  return (account.favoriteProductIds || []) as string[];
}
export function registerFavoriteRoutes(app: Express) {
  app.get(
    '/api/favorites',
    guard(),
    safe(async (req, res) => {
      const userId = identity(req)!.sub;
      res.json({ productIds: await accountFavorites(userId) });
    }),
  );
  app.put(
    '/api/favorites/:productId',
    guard(),
    safe(async (req, res) => {
      const id = favoriteIdSchema.parse(req.params.productId);
      if (!(await activeProduct(id))) throw new HttpError(404, 'Product not found');
      res.json({ productIds: await setFavorite(identity(req)!.sub, id, true) });
    }),
  );
  app.delete(
    '/api/favorites/:productId',
    guard(),
    safe(async (req, res) => {
      const id = favoriteIdSchema.parse(req.params.productId);
      res.json({ productIds: await setFavorite(identity(req)!.sub, id, false) });
    }),
  );
  app.post(
    '/api/favorites/merge',
    guard(),
    safe(async (req, res) => {
      const ids = [...new Set(favoritesMergeSchema.parse(req.body).productIds)];
      const available = new Set((await productsById(ids)).filter((p) => p.active).map((p) => p.id));
      const valid = ids.filter((id) => available.has(id));
      const userId = identity(req)!.sub;
      if (demo) {
        const merged = [...new Set([...(demoFavorites.get(userId) || []), ...valid])];
        demoFavorites.set(userId, merged);
        return res.json({ productIds: merged });
      }
      // Atomically merge with existing account favourites, preserving values from other devices.
      const account = valid.length
        ? await UserModel.findByIdAndUpdate(
            userId,
            { $addToSet: { favoriteProductIds: { $each: valid } } },
            { new: true },
          )
            .select('favoriteProductIds')
            .lean()
        : await UserModel.findById(userId).select('favoriteProductIds').lean();
      if (!account) throw new HttpError(401, 'Sign in required');
      res.json({ productIds: account.favoriteProductIds || [] });
    }),
  );
}
