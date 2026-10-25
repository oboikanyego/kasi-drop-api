import type { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UserModel } from '../models.js';
import { guard, identity, publicUser, token, users } from '../accounts.js';
import { safe } from '../http.js';
import { demo, memUsers, type User } from '../state.js';

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
      res.status(201).json({ user: publicUser(u), token: token(u) });
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
      res.json({ user: publicUser(u), token: token(u) });
    }),
  );
  app.get('/api/auth/me', guard(), (req, res) => {
    const u = identity(req)!;
    res.json({ user: { id: u.sub, name: u.name, email: u.email, role: u.role } });
  });
}
