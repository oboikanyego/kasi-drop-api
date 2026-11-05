import type { Express } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { Schema, model } from 'mongoose';
import { OrderModel } from './models.js';
import { guard } from './accounts.js';
import { demo } from './state.js';
import { safe } from './http.js';

export const eventNames = [
  'page_view',
  'product_search',
  'ai_chat',
  'add_to_cart',
  'checkout_started',
  'checkout_created',
  'api_error',
  'product_view',
] as const;
export const clientEventNames = ['page_view','product_search','ai_chat','add_to_cart','checkout_started','checkout_created','product_view'] as const;
const eventSchema = z.object({
  name: z.enum(clientEventNames),
  productId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/).optional(),
  // Never accept raw search queries, prompts, addresses, user IDs or full URLs.
  page: z
    .enum([
      'home',
      'shop',
      'product',
      'cart',
      'checkout',
      'orders',
      'favorites',
      'account',
      'admin',
      'feedback',
      'other',
    ])
    .optional(),
});
const feedbackSchema = z.object({
  category: z.enum(['bug', 'idea', 'experience', 'other']),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(10).max(1500),
});
const EventModel = model(
  'KasiAnalyticsEvent',
  new Schema({
    name: { type: String, enum: eventNames, required: true },
    page: String,
    productId: String,
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  }),
);
const FeedbackModel = model(
  'KasiCustomerFeedback',
  new Schema({
    id: { type: String, unique: true, required: true },
    category: String,
    rating: Number,
    message: String,
    status: { type: String, enum: ['new','in_review','resolved','closed'], default: 'new' },
    createdAt: { type: Date, default: Date.now },
  }),
);
const demoEvents: Array<{ name: string; page?: string; productId?: string; createdAt: Date }> = [];
const demoFeedback: Array<{ id: string; category: string; rating?: number; message: string; status: string; createdAt: Date }> = [];
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export async function recordApiError(): Promise<void> {
  const data = { name: 'api_error', createdAt: new Date() };
  if (demo) {
    demoEvents.push(data);
    if (demoEvents.length > 10000) demoEvents.shift();
  } else await EventModel.create(data);
}

export function registerInsightsRoutes(app: Express) {
  app.post(
    '/api/analytics/events',
    limiter,
    safe(async (req, res) => {
      const data = eventSchema.parse(req.body);
      if (data.productId && !['product_view', 'add_to_cart'].includes(data.name)) return res.status(400).json({ error: 'Invalid event metadata' });
      if (demo) {
        demoEvents.push({ ...data, createdAt: new Date() });
        if (demoEvents.length > 10000) demoEvents.shift();
      } else await EventModel.create(data);
      res.status(202).json({ accepted: true });
    }),
  );
  app.post(
    '/api/feedback',
    limiter,
    safe(async (req, res) => {
      const data = { ...feedbackSchema.parse(req.body), id: randomUUID(), status: 'new' as const };
      if (demo) {
        demoFeedback.push({ ...data, createdAt: new Date() });
        if (demoFeedback.length > 1000) demoFeedback.shift();
      } else await FeedbackModel.create(data);
      res.status(201).json({ received: true });
    }),
  );
  app.get(
    '/api/admin/analytics',
    guard('admin'),
    safe(async (_req, res) => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const grouped = demo
        ? eventNames.map((name) => ({
            name,
            count: demoEvents.filter((e) => e.name === name && e.createdAt >= since).length,
          }))
        : await EventModel.aggregate<{ name: string; count: number }>([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: '$name', count: { $sum: 1 } } },
            { $project: { _id: 0, name: '$_id', count: 1 } },
          ]);
      const confirmedPayments = demo ? 0 : await OrderModel.countDocuments({ demoSeed: { $ne: true }, status: { $in: ['paid','processing','shipped','delivered'] }, paidAt: { $gte: since } });
      const counts = Object.fromEntries(
        eventNames.map((name) => [name, grouped.find((x) => x.name === name)?.count ?? 0]),
      );
      res.json({
        periodDays: 30,
        counts,
        confirmedPayments,
        paymentConversion: counts.checkout_started ? Number((confirmedPayments / counts.checkout_started * 100).toFixed(1)) : 0,
        checkoutConversion: counts.checkout_started
          ? Number(((counts.checkout_created / counts.checkout_started) * 100).toFixed(1))
          : 0,
        note: 'Event counts are not unique visitors. Confirmed payments are server-side, non-demo paid orders, based on paidAt. This is an aggregate ratio, not a session-based conversion rate.',
      });
    }),
  );
  app.patch('/api/admin/feedback/:id', guard('admin'), safe(async (req, res) => {
    const status = z.enum(['new','in_review','resolved','closed']).parse(req.body?.status);
    const id = z.string().regex(/^(?:[0-9a-f]{24}|[0-9a-f-]{36})$/i).parse(req.params.id);
    if (demo) {
      const item = demoFeedback.find(x => x.id === id);
      if (!item) return res.status(404).json({ error: 'Feedback not found' });
      item.status = status;
      return res.json({ id, status });
    }
    const query = /^[0-9a-f]{24}$/i.test(id) ? { _id: id } : { id };
    const item = await FeedbackModel.findOneAndUpdate(query, { $set: { status } }, { new: true });
    if (!item) return res.status(404).json({ error: 'Feedback not found' });
    res.json({ id, status });
  }));
  app.get(
    '/api/admin/feedback',
    guard('admin'),
    safe(async (_req, res) => {
      const items = demo
        ? [...demoFeedback].reverse().slice(0, 100)
        : await FeedbackModel.find()
            .sort({ createdAt: -1 })
            .limit(100)
            .select('id category rating message status createdAt')
            .lean();
      res.json({ feedback: items.map((item) => ({ ...(typeof item.toObject === 'function' ? item.toObject() : item), id: 'id' in item && item.id ? item.id : String(item._id) })) });
    }),
  );
}

/** Aggregate product interest, not shopper-level profiling. Never persists user identity. */
export async function popularProductIds(limit = 30): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (demo) {
    const weights = new Map<string, number>();
    for (const item of demoEvents) {
      if (!item.productId || item.createdAt < since) continue;
      weights.set(item.productId, (weights.get(item.productId) ?? 0) + (item.name === 'add_to_cart' ? 4 : 1));
    }
    return [...weights].sort((a,b) => b[1] - a[1]).slice(0,limit).map(x=>x[0]);
  }
  const rows = await EventModel.aggregate<{ _id: string; score: number }>([
    { $match: { createdAt: { $gte: since }, name: { $in: ['product_view','add_to_cart'] }, productId: { $type: 'string' } } },
    { $group: { _id: '$productId', score: { $sum: { $cond: [{ $eq: ['$name','add_to_cart'] }, 4, 1] } } } },
    { $sort: { score: -1 } }, { $limit: limit },
  ]);
  return rows.map(x=>x._id);
}
