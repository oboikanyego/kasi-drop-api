import type { Express, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UserModel } from '../models.js';
import { guard, identity, publicUser, token, users } from '../accounts.js';
import { safe } from '../http.js';
import { demo, memUsers, secureCookies, type User } from '../state.js';
import { sessionCookieName, sessionCookieOptions, sessionMaxAgeMs } from '../session-cookie.js';

/**
 * Sign the browser in with an httpOnly session cookie. The token is still returned in the body
 * for API clients and for UIs released before the cookie, which send it as a Bearer header.
 */
function startSession(res: Response, u: Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  const signed = token(u);
  res.cookie(sessionCookieName, signed, {
    ...sessionCookieOptions(secureCookies),
    maxAge: sessionMaxAgeMs,
  });
  return signed;
}

const registration = z.object({
  name: z.string().min(2).max(80),
  email: z
    .string()
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(100),
});
const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  password: z.string(),
});
export function registerAuthRoutes(app: Express) {
  app.post(
    '/api/auth/register',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }),
    safe(async (req, res) => {
      const parsed = registration.parse(req.body);
      if (await users(parsed.email))
        return res.status(409).json({ error: 'Email is already registered' });
      const { password, ...profile } = parsed;
      const u: User = {
        id: randomUUID(),
        ...profile,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'customer',
      };
      if (demo) memUsers.push(u);
      else {
        const saved = await UserModel.create({
          email: u.email,
          name: u.name,
          passwordHash: u.passwordHash,
          role: u.role,
        });
        u.id = String(saved._id);
      }
      res.status(201).json({ user: publicUser(u), token: startSession(res, u) });
    }),
  );
  app.post(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }),
    safe(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);
      const u = await users(email);
      if (!u || !(await bcrypt.compare(password, u.passwordHash)))
        return res.status(401).json({ error: 'Invalid email or password' });
      res.json({ user: publicUser(u), token: startSession(res, u) });
    }),
  );
  // Moves a session from a Bearer token (kept in browser storage by older UIs) into the cookie.
  app.post('/api/auth/session', guard(), (req, res) => {
    const u = identity(req)!;
    startSession(res, { id: u.sub, email: u.email, name: u.name, role: u.role });
    res.json({ user: { id: u.sub, name: u.name, email: u.email, role: u.role } });
  });
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(sessionCookieName, sessionCookieOptions(secureCookies));
    res.sendStatus(204);
  });
  app.get('/api/auth/me', guard(), (req, res) => {
    const u = identity(req)!;
    res.json({ user: { id: u.sub, name: u.name, email: u.email, role: u.role } });
  });
}
