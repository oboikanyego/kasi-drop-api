import mongoose from 'mongoose';
import type { Order } from './order-rules.js';
import { OrderModel, ProductModel } from './models.js';
import { HttpError } from './http-error.js';
import {
  reservationExpired,
  reservationMinutes,
  expiryTransition,
  type Transition,
} from './reservations.js';
import { demo, memOrders, memProducts } from './state.js';

export async function getOrder(id: string): Promise<Order | undefined> {
  return demo
    ? memOrders.find((o) => o.id === id)
    : ((await OrderModel.findOne({ id }).lean()) as unknown as Order) || undefined;
}
export async function updateOrder(id: string, changes: Partial<Order>) {
  if (demo) {
    const o = memOrders.find((o) => o.id === id);
    if (o) Object.assign(o, changes);
  } else await OrderModel.updateOne({ id }, { $set: changes });
}
function adjustDemoStock(lines: Order['items'], change: 'reserve' | 'release') {
  if (change === 'reserve') {
    for (const l of lines) {
      const p = memProducts.find((p) => p.id === l.productId);
      if (!p || p.stock < l.quantity) throw new HttpError(409, 'Insufficient stock for ' + l.name);
    }
  }
  for (const l of lines) {
    const p = memProducts.find((p) => p.id === l.productId);
    if (p) p.stock += change === 'reserve' ? -l.quantity : l.quantity;
  }
}
async function adjustStock(
  lines: Order['items'],
  change: 'reserve' | 'release',
  session: mongoose.ClientSession,
) {
  for (const l of lines) {
    if (change === 'release') {
      await ProductModel.updateOne(
        { id: l.productId },
        { $inc: { stock: l.quantity } },
        { session },
      );
      continue;
    }
    const result = await ProductModel.updateOne(
      { id: l.productId, active: true, stock: { $gte: l.quantity } },
      { $inc: { stock: -l.quantity } },
      { session },
    );
    if (result.modifiedCount !== 1) throw new HttpError(409, 'Insufficient stock for ' + l.name);
  }
}
export async function decrementStock(lines: Order['items']) {
  if (demo) return adjustDemoStock(lines, 'reserve');
  // MongoDB multi-document transaction requires Atlas replica set; roll back fully on errors.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => adjustStock(lines, 'reserve', session));
  } finally {
    await session.endSession();
  }
}
class TransitionConflict extends Error {}
/**
 * Apply an order transition and its stock change atomically, only if the order is still in the state
 * it was read in. Returns false when another request changed it first; throws 409 when stock ran out.
 */
export async function applyTransition(order: Order, t: Transition): Promise<boolean> {
  if (demo) {
    // No awaits: the check and both writes happen in one tick.
    const o = memOrders.find((o) => o.id === order.id);
    if (
      !o ||
      o.status !== order.status ||
      Boolean(o.stockReserved) !== Boolean(order.stockReserved)
    )
      return false;
    if (t.stock !== 'none') adjustDemoStock(o.items, t.stock);
    Object.assign(o, t.changes);
    return true;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await OrderModel.updateOne(
        {
          id: order.id,
          status: order.status,
          stockReserved: order.stockReserved ? true : { $ne: true },
        },
        { $set: t.changes },
        { session },
      );
      if (result.modifiedCount !== 1) throw new TransitionConflict();
      if (t.stock !== 'none') await adjustStock(order.items, t.stock, session);
    });
    return true;
  } catch (err) {
    if (err instanceof TransitionConflict) return false;
    throw err;
  } finally {
    await session.endSession();
  }
}
/** Return stock held by PayFast orders that were never paid. A late COMPLETE ITN re-takes stock if any is left. */
export async function expireReservations() {
  const cutoff = new Date(Date.now() - reservationMinutes() * 60_000);
  const due = demo
    ? memOrders.filter((o) => reservationExpired(o))
    : ((await OrderModel.find({
        status: 'pending_payment',
        paymentMethod: 'payfast',
        stockReserved: true,
        createdAt: { $lte: cutoff },
      })
        .limit(100)
        .lean()) as unknown as Order[]);
  let expired = 0;
  for (const o of due)
    if (reservationExpired(o) && (await applyTransition(o, expiryTransition()))) expired++;
  if (expired)
    console.info('[reservations] released expired PayFast reservations', { orders: expired });
}
