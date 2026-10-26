import type { Express } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { Schema, model } from 'mongoose';
import { guard } from './accounts.js';
import { demo } from './state.js';
import { safe } from './http.js';

export const eventNames = ['page_view', 'product_search', 'ai_chat', 'add_to_cart', 'checkout_started', 'checkout_created', 'api_error'] as const;
const eventSchema = z.object({
  name: z.enum(eventNames),
  // Never accept raw search queries, prompts, addresses, user IDs or full URLs.
  page: z.enum(['home', 'shop', 'product', 'cart', 'checkout', 'orders', 'favorites', 'account', 'admin', 'feedback', 'other']).optional(),
});
const feedbackSchema = z.object({
  category: z.enum(['bug', 'idea', 'experience', 'other']),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(10).max(1500),
});
const EventModel = model('KasiAnalyticsEvent', new Schema({
  name: { type: String, enum: eventNames, required: true },
  page: String, createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
}));
const FeedbackModel = model('KasiCustomerFeedback', new Schema({
  category: String, rating: Number, message: String, createdAt: { type: Date, default: Date.now },
}));
const demoEvents: Array<{ name: string; page?: string; createdAt: Date }> = [];
const demoFeedback: Array<{ category: string; rating?: number; message: string; createdAt: Date }> = [];
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

export function registerInsightsRoutes(app: Express) {
  app.post('/api/analytics/events', limiter, safe(async (req, res) => {
    const data = eventSchema.parse(req.body);
    if (demo) {
      demoEvents.push({ ...data, createdAt: new Date() });
      if (demoEvents.length > 10000) demoEvents.shift();
    } else await EventModel.create(data);
    res.status(202).json({ accepted: true });
  }));
  app.post('/api/feedback', limiter, safe(async (req, res) => {
    const data = feedbackSchema.parse(req.body);
    if (demo) {
      demoFeedback.push({ ...data, createdAt: new Date() });
      if (demoFeedback.length > 1000) demoFeedback.shift();
    } else await FeedbackModel.create(data);
    res.status(201).json({ received: true });
  }));
  app.get('/api/admin/analytics', guard('admin'), safe(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const grouped = demo
      ? eventNames.map(name => ({ name, count: demoEvents.filter(e => e.name === name && e.createdAt >= since).length }))
      : await EventModel.aggregate<{ name: string; count: number }>([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$name', count: { $sum: 1 } } },
          { $project: { _id: 0, name: '$_id', count: 1 } },
        ]);
    const counts = Object.fromEntries(eventNames.map(name => [name, grouped.find(x => x.name === name)?.count ?? 0]));
    res.json({ periodDays: 30, counts, checkoutConversion: counts.checkout_started ? Number((counts.checkout_created / counts.checkout_started * 100).toFixed(1)) : 0, note: 'Event counts, not unique visitors or confirmed payments.' });
  }));
  app.get('/api/admin/feedback', guard('admin'), safe(async (_req, res) => {
    const items = demo ? [...demoFeedback].reverse().slice(0, 100) : await FeedbackModel.find().sort({ createdAt: -1 }).limit(100).select('category rating message createdAt').lean();
    res.json({ feedback: items });
  }));
}
