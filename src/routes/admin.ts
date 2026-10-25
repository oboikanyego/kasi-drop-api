import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Order } from '../order-rules.js';
import { OrderModel, ProductModel } from '../models.js';
import { guard } from '../accounts.js';
import { adminOrderLimit } from '../catalogue-store.js';
import { getOrder, updateOrder } from '../order-store.js';
import { safe } from '../http.js';
import { demo, memOrders, memProducts } from '../state.js';

const productSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(1500),
  category: z.string().min(2),
  price: z.number().positive().max(100000),
  stock: z.number().int().min(0),
  image: z.string().url().max(500),
  tags: z.array(z.string().max(30)).max(10).default([]),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});
export function registerAdminRoutes(app: Express) {
  app.get(
    '/api/admin/summary',
    guard('admin'),
    safe(async (req, res) => {
      const revenueStatuses = ['paid', 'processing', 'shipped', 'delivered'];
      if (demo) {
        const isSimulation = (o: Order) => Boolean(o.demoSeed) || o.status === 'demo_paid';
        return res.json({
          products: memProducts.length,
          lowStock: memProducts.filter((p) => p.stock <= 5).length,
          orders: memOrders.length,
          demoOrders: memOrders.filter(isSimulation).length,
          revenue: memOrders
            .filter((o) => !isSimulation(o) && revenueStatuses.includes(o.status))
            .reduce((a, o) => a + o.total, 0),
          simulatedRevenue: memOrders
            .filter((o) => isSimulation(o) && [...revenueStatuses, 'demo_paid'].includes(o.status))
            .reduce((a, o) => a + o.total, 0),
          recentOrders: [...memOrders]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10),
        });
      }
      // Same figures as the demo branch, computed in MongoDB instead of loading every order.
      const simulation = { $or: [{ demoSeed: true }, { status: 'demo_paid' }] };
      const sumTotals = async (match: Record<string, unknown>) =>
        (
          await OrderModel.aggregate<{ total: number }>([
            { $match: match },
            { $group: { _id: null, total: { $sum: '$total' } } },
          ])
        )[0]?.total ?? 0;
      const [
        productCount,
        lowStock,
        orderCount,
        demoOrders,
        revenue,
        simulatedRevenue,
        recentOrders,
      ] = await Promise.all([
        ProductModel.countDocuments(),
        ProductModel.countDocuments({ stock: { $lte: 5 } }),
        OrderModel.countDocuments(),
        OrderModel.countDocuments(simulation),
        sumTotals({ demoSeed: { $ne: true }, status: { $in: revenueStatuses } }),
        sumTotals({ ...simulation, status: { $in: [...revenueStatuses, 'demo_paid'] } }),
        OrderModel.find().sort({ createdAt: -1 }).limit(10).lean(),
      ]);
      res.json({
        products: productCount,
        lowStock,
        orders: orderCount,
        demoOrders,
        revenue,
        simulatedRevenue,
        recentOrders,
      });
    }),
  );
  app.get(
    '/api/admin/orders',
    guard('admin'),
    safe(async (req, res) => {
      // Newest first, bounded so the admin page never loads the whole order history.
      const orders = demo
        ? [...memOrders]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, adminOrderLimit)
        : await OrderModel.find().sort({ createdAt: -1 }).limit(adminOrderLimit).lean();
      res.json({ orders });
    }),
  );
  app.patch(
    '/api/admin/orders/:id',
    guard('admin'),
    safe(async (req, res) => {
      const status = z
        .enum(['processing', 'shipped', 'delivered', 'cancelled'])
        .parse(req.body.status);
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      if (!['paid', 'demo_paid', 'processing', 'shipped'].includes(order.status))
        return res.status(409).json({ error: 'Order is not paid or fulfilment has not started' });
      if (status === 'cancelled')
        return res.status(409).json({
          error: 'Refund and cancellation must be handled through a verified payment workflow',
        });
      await updateOrder(order.id, { status });
      res.json({ ok: true, status });
    }),
  );
  app.post(
    '/api/admin/products',
    guard('admin'),
    safe(async (req, res) => {
      const input = productSchema.parse(req.body);
      const p = { ...input, id: randomUUID() };
      if (demo) memProducts.unshift(p);
      else await ProductModel.create(p);
      res.status(201).json({ product: p });
    }),
  );
  app.patch(
    '/api/admin/products/:id',
    guard('admin'),
    safe(async (req, res) => {
      const change = productSchema.partial().parse(req.body);
      if (demo) {
        const p = memProducts.find((p) => p.id === req.params.id);
        if (!p) return res.sendStatus(404);
        Object.assign(p, change);
        return res.json({ product: p });
      }
      const p = await ProductModel.findOneAndUpdate(
        { id: req.params.id },
        { $set: change },
        { new: true },
      ).lean();
      if (!p) return res.sendStatus(404);
      res.json({ product: p });
    }),
  );
}
