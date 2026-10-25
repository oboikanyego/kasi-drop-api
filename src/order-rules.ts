/** Pure business rules: safe for unit tests and shared across API handlers. */
/** Every status an order can be stored with; the OrderModel schema enforces the same list. */
export const orderStatuses = [
  'pending_payment',
  'paid',
  'demo_paid',
  'failed',
  'expired',
  'requires_review',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
// demo_seed marks database-seeded sample orders (see demo-fixtures.ts).
export const paymentMethods = ['demo', 'payfast', 'demo_seed'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
/** A priced cart line as quote() produces it and an order stores it. */
export type OrderLine = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
};
export type DeliveryDetails = {
  name: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
};
export type Order = {
  id: string;
  userId: string;
  email: string;
  items: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  stockReserved?: boolean;
  demoSeed?: boolean;
  delivery: DeliveryDetails;
  createdAt: Date;
  paidAt?: Date;
};
export const orderTransitions: Readonly<Record<string, readonly string[]>> = {
  paid: ['processing'],
  demo_paid: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
};
export function canAdvanceOrder(current: string, next: string): boolean {
  return Boolean(orderTransitions[current]?.includes(next));
}
/** Prices are represented in cents for payment calculations; reject fractional cents. */
export function validatePrice(price: number): boolean {
  return (
    Number.isFinite(price) &&
    price > 0 &&
    Number.isSafeInteger(Math.round(price * 100)) &&
    Math.abs(price * 100 - Math.round(price * 100)) < 1e-6
  );
}
export function inCents(price: number): number {
  if (!validatePrice(price)) throw new Error('Invalid monetary amount');
  return Math.round(price * 100);
}
