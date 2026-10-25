import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { UserModel } from './models.js';
import { currentIdentity, type Identity, type Role } from './auth.js';
import { demo, secret, memUsers, type User } from './state.js';

export async function users(email: string): Promise<User | undefined> {
  if (demo) return memUsers.find((u) => u.email === email);
  const u = await UserModel.findOne({ email }).lean();
  return u
    ? {
        id: String(u._id),
        email: String(u.email),
        name: String(u.name),
        passwordHash: String(u.passwordHash),
        role: u.role as Role,
      }
    : undefined;
}
export function token(u: { id: string; email: string; name: string; role: Role }) {
  return jwt.sign({ sub: u.id, email: u.email, name: u.name, role: u.role }, secret, {
    expiresIn: '7d',
  });
}
export async function userById(id: string): Promise<User | undefined> {
  if (demo) return memUsers.find((u) => u.id === id);
  if (!mongoose.isValidObjectId(id)) return undefined;
  const u = await UserModel.findById(id).lean();
  return u
    ? {
        id: String(u._id),
        email: String(u.email),
        name: String(u.name),
        passwordHash: String(u.passwordHash),
        role: u.role as Role,
      }
    : undefined;
}
// Set by guard() from the stored account, so handlers never act on stale token claims.
const identities = new WeakMap<Request, Identity>();
export function identity(req: Request): Identity | null {
  return identities.get(req) ?? null;
}
export const guard = (role?: Role) => (req: Request, res: Response, next: NextFunction) => {
  let claims: unknown;
  try {
    claims = jwt.verify((req.headers.authorization || '').replace(/^Bearer /i, ''), secret);
  } catch {
    return res.status(401).json({ error: 'Sign in required' });
  }
  currentIdentity(claims, userById)
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Sign in required' });
      if (role && u.role !== role) return res.status(403).json({ error: 'Admin access required' });
      identities.set(req, u);
      next();
    })
    .catch(next);
};
export const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
