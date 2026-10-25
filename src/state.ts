// Process-wide mode and the in-memory stores used in demo mode (DEMO_MODE=true).
import { randomUUID } from 'node:crypto';
import { seedProducts } from './catalogue.js';
import type { Order } from './order-rules.js';
import type { Role } from './auth.js';

export const demo = process.env.DEMO_MODE === 'true';
export const secret = process.env.JWT_SECRET || (demo ? randomUUID() + randomUUID() : '');
if (!secret) throw Error('JWT_SECRET must be set in persistent mode');
// Session cookies are Secure wherever the API is served over HTTPS (Render sets NODE_ENV).
export const secureCookies = process.env.NODE_ENV === 'production';
export const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
export type User = { id: string; name: string; email: string; passwordHash: string; role: Role };
export const memProducts = seedProducts.map((p) => ({ ...p, tags: [...p.tags] }));
export const memUsers: User[] = [];
export const memOrders: Order[] = [];
export const demoFavorites = new Map<string, string[]>();
