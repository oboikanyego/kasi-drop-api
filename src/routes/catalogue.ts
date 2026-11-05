import type { Express } from 'express';
import { z } from 'zod';
import { categories, seedProducts, shippingRule } from '../catalogue.js';
import { payfastConfigured } from '../payfast-config.js';
import { geminiConfigured } from '../ai.js';
import { groqConfigured } from '../groq.js';
import {
  activeProduct,
  listProducts,
  similarProducts,
  trendingProducts,
} from '../catalogue-store.js';
import { safe } from '../http.js';
import { demo } from '../state.js';
import { demoSeedStatus, seedStatus } from '../startup.js';

export function registerCatalogueRoutes(app: Express) {
  app.get(
    '/api/recommendations',
    safe(async (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({ products: await trendingProducts(8), strategy: 'anonymous-usage-and-featured' });
    }),
  );
  app.get('/health', (req, res) =>
    res.json({
      ok: true,
      app: 'KasiDrop API',
      mode: demo ? 'demo' : 'database',
      catalogue: demo
        ? { source: 'memory', templateProducts: seedProducts.length, notPersisted: true }
        : { source: 'mongodb', ...seedStatus },
      ...(demo ? {} : { demoData: demoSeedStatus }),
      timestamp: new Date().toISOString(),
    }),
  );
  app.get('/api/meta', (req, res) =>
    res.json({
      name: 'KasiDrop',
      currency: 'ZAR',
      categories,
      demoMode: demo,
      checkoutEnabled: demo || payfastConfigured(),
      // The rule quote() charges, so the UI never shows a different delivery fee.
      shipping: { freeFrom: shippingRule.freeFromCents / 100, fee: shippingRule.feeCents / 100 },
      aiEnabled: geminiConfigured() || groqConfigured(),
    }),
  );
  app.get(
    '/api/products',
    safe(async (req, res) => {
      const amount = z.coerce.number().finite().min(0).max(1000000).optional();
      const minPrice = amount.parse(
        req.query.minPrice === undefined ? undefined : req.query.minPrice,
      );
      const maxPrice = amount.parse(
        req.query.maxPrice === undefined ? undefined : req.query.maxPrice,
      );
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
        return res.status(400).json({ error: 'Minimum price cannot exceed maximum price' });
      const result = await listProducts(
        {
          q: String(req.query.q || ''),
          category: String(req.query.category || 'All'),
          minPrice,
          maxPrice,
          sort: String(req.query.sort || 'featured'),
        },
        req.query.page,
        req.query.limit,
      );
      res.json({
        products: result.products,
        total: result.total,
        page: result.pageNumber,
        pageSize: result.pageSize,
      });
    }),
  );
  app.get(
    '/api/products/:id',
    safe(async (req, res) => {
      const p = await activeProduct(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      res.json({ product: p, similar: await similarProducts(p) });
    }),
  );
}
