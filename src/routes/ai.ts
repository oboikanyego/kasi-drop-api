import type { Express } from 'express';
import { z } from 'zod';
import { draftListing, geminiConfigured, shoppingAssistant } from '../ai.js';
import { groqConfigured } from '../groq.js';
import { guard } from '../accounts.js';
import { assistantCatalogue } from '../catalogue-store.js';
import { aiLimiter, safe } from '../http.js';

export function registerAiRoutes(app: Express) {
  app.post(
    '/api/ai/chat',
    aiLimiter,
    safe(async (req, res) => {
      const message = z.string().min(2).max(400).parse(req.body.message);
      const result = await shoppingAssistant(message, await assistantCatalogue());
      res.json(result);
    }),
  );
  app.post(
    '/api/admin/ai/listing',
    guard('admin'),
    aiLimiter,
    safe(async (req, res) => {
      const info = z
        .object({
          name: z.string().min(2).max(100),
          notes: z.string().min(5).max(1000),
          category: z.string().max(60),
        })
        .parse(req.body);
      if (!geminiConfigured() && !groqConfigured())
        return res.status(503).json({ error: 'Set GEMINI_API_KEY or GROQ_API_KEY on backend' });
      res.json({ draft: await draftListing(info) });
    }),
  );
}
