import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { quote } from '../catalogue.js';
import { payfastConfig, payfastConfigured } from '../payfast-config.js';
import { payfastSignature } from '../payfast-signature.js';
import type { Order } from '../order-rules.js';
import { OrderModel } from '../models.js';
import { guard, identity } from '../accounts.js';
import { productsById } from '../catalogue-store.js';
import { applyTransition, decrementStock, getOrder, updateOrder } from '../order-store.js';
import { safe } from '../http.js';
import { clientUrl, demo, memOrders } from '../state.js';

const checkoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  paymentMethod: z.enum(['demo', 'payfast']),
  delivery: z.object({
    name: z.string().min(2),
    phone: z.string().min(8),
    address: z.string().min(5),
    city: z.string().min(2),
    province: z.string().min(2),
    postalCode: z.string().min(3),
  }),
});
function paymentBase(o: Order) {
  const config = payfastConfig();
  if (!config) throw Error('PayFast sandbox is not configured');
  const api = process.env.PUBLIC_API_URL || 'http://localhost:10000';
  return {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: clientUrl + '/orders?payment=return',
    cancel_url: clientUrl + '/orders?payment=cancel',
    notify_url: api + '/api/payfast/notify',
    m_payment_id: o.id,
    amount: o.total.toFixed(2),
    item_name: 'KasiDrop order ' + o.id.slice(0, 8),
  };
}
function pfSignature(fields: Record<string, string>) {
  return payfastSignature(fields, process.env.PAYFAST_PASSPHRASE || '');
}
export function registerOrderRoutes(app: Express) {
  app.post(
    '/api/orders/checkout',
    guard(),
    safe(async (req, res) => {
      const u = identity(req)!;
      const payload = checkoutSchema.parse(req.body);
      if (!demo && payload.paymentMethod === 'demo')
        return res.status(400).json({ error: 'Demo checkout is unavailable in persistent mode' });
      const pricing = quote(
        await productsById(payload.items.map((item) => item.productId)),
        payload.items,
      );
      const order: Order = {
        id: randomUUID(),
        userId: u.sub,
        email: u.email,
        items: pricing.lines,
        ...pricing,
        status: 'pending_payment',
        paymentMethod: payload.paymentMethod,
        delivery: payload.delivery,
        createdAt: new Date(),
      };
      if (payload.paymentMethod === 'payfast' && !payfastConfigured())
        return res.status(503).json({ error: 'PayFast sandbox is not configured' });
      if (demo) memOrders.push(order);
      else await OrderModel.create(order);
      if (payload.paymentMethod === 'payfast') {
        // Hold stock while the shopper pays so two shoppers cannot both pay for the last item.
        try {
          if (
            !(await applyTransition(order, {
              changes: { status: 'pending_payment', stockReserved: true },
              stock: 'reserve',
            }))
          )
            throw Error('Order changed during checkout');
        } catch (e) {
          await updateOrder(order.id, { status: 'failed' });
          throw e;
        }
        order.stockReserved = true;
      }
      if (payload.paymentMethod === 'demo') {
        try {
          await decrementStock(order.items);
          await updateOrder(order.id, { status: 'demo_paid', paidAt: new Date() });
          order.status = 'demo_paid';
        } catch (e) {
          await updateOrder(order.id, { status: 'failed' });
          throw e;
        }
        return res
          .status(201)
          .json({ order, payment: null, warning: 'Simulated payment only. No money was charged.' });
      }
      const data = paymentBase(order);
      const signature = pfSignature(data);
      res.status(201).json({
        order,
        payment: {
          url: 'https://sandbox.payfast.co.za/eng/process',
          fields: { ...data, signature },
        },
      });
    }),
  );
  app.get(
    '/api/orders',
    guard(),
    safe(async (req, res) => {
      const u = identity(req)!;
      // Newest first: MongoDB sorts, and demo mode sorts its in-memory copy the same way.
      const orders = demo
        ? memOrders
            .filter((o) => o.userId === u.sub)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        : await OrderModel.find({ userId: u.sub }).sort({ createdAt: -1 }).lean();
      res.json({ orders });
    }),
  );
  app.get(
    '/api/orders/:id',
    guard(),
    safe(async (req, res) => {
      const u = identity(req)!;
      const order = await getOrder(req.params.id);
      if (!order || (order.userId !== u.sub && u.role !== 'admin'))
        return res.status(404).json({ error: 'Not found' });
      res.json({ order });
    }),
  );
}
