import type { OrderStatus } from './order-rules.js';
/**
 * PayFast stock reservation rules. Stock is reserved when a PayFast order is created and
 * released if payment fails or the reservation expires. Kept pure so every transition is testable.
 */
export type StockChange = 'reserve' | 'release' | 'none';
export type ReservableOrder = {
  status: string;
  paymentMethod: string;
  stockReserved?: boolean;
  createdAt: Date | string;
};
export type Transition = {
  changes: { status: OrderStatus; stockReserved: boolean; paidAt?: Date };
  stock: StockChange;
};
export const reservationMinutes = () => {
  const minutes = Number(process.env.PAYFAST_RESERVATION_MINUTES);
  return Number.isFinite(minutes) && minutes >= 5 ? minutes : 30;
};
/** Orders whose payment can still change their state. `expired` orders may yet receive a late COMPLETE. */
const awaitingPayment = ['pending_payment', 'expired'];
/** What a verified PayFast ITN does to an order, or null when the order must not change. */
export function paymentTransition(
  order: ReservableOrder,
  paymentStatus: string,
  now = new Date(),
): Transition | null {
  if (!awaitingPayment.includes(order.status)) return null;
  const reserved = Boolean(order.stockReserved);
  if (paymentStatus === 'COMPLETE') {
    // Already holding stock: just mark paid. Otherwise (expired, or created before reservations) take stock now.
    return {
      changes: { status: 'paid', stockReserved: true, paidAt: now },
      stock: reserved ? 'none' : 'reserve',
    };
  }
  if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
    return {
      changes: { status: 'failed', stockReserved: false },
      stock: reserved ? 'release' : 'none',
    };
  }
  return null;
}
/** A paid order whose stock could not be taken (it sold out after the reservation expired). */
export const needsReview = (): Transition => ({
  changes: { status: 'requires_review', stockReserved: false },
  stock: 'none',
});
export function reservationExpired(
  order: ReservableOrder,
  now = new Date(),
  minutes = reservationMinutes(),
): boolean {
  return (
    order.status === 'pending_payment' &&
    order.paymentMethod === 'payfast' &&
    Boolean(order.stockReserved) &&
    now.getTime() - new Date(order.createdAt).getTime() >= minutes * 60_000
  );
}
export const expiryTransition = (): Transition => ({
  changes: { status: 'expired', stockReserved: false },
  stock: 'release',
});
