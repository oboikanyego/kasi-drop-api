import { quote, seedProducts } from './catalogue.js';

export const demoAccounts = [
  { email: 'demo.admin@kasidrop.test', name: 'KasiDrop Demo Admin', role: 'admin' },
  { email: 'thandi.demo@kasidrop.test', name: 'Thandi Mokoena', role: 'customer' },
  { email: 'sipho.demo@kasidrop.test', name: 'Sipho Dlamini', role: 'customer' },
  { email: 'naledi.demo@kasidrop.test', name: 'Naledi Khumalo', role: 'customer' },
] as const;

export type DemoAccountEmail = (typeof demoAccounts)[number]['email'];

export type DemoOrderFixture = {
  id: string;
  customerEmail: DemoAccountEmail;
  status: 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered';
  items: { productId: string; quantity: number }[];
  daysAgo: number;
};

export const demoOrderFixtures: readonly DemoOrderFixture[] = [
  {
    id: 'KDTEST01-ORDER',
    customerEmail: 'thandi.demo@kasidrop.test',
    status: 'pending_payment',
    items: [
      { productId: 'biltong-box', quantity: 1 },
      { productId: 'rooibos-tea', quantity: 1 },
    ],
    daysAgo: 1,
  },
  {
    id: 'KDTEST02-ORDER',
    customerEmail: 'sipho.demo@kasidrop.test',
    status: 'paid',
    items: [
      { productId: 'shweshwe-tote', quantity: 1 },
      { productId: 'candle', quantity: 1 },
    ],
    daysAgo: 3,
  },
  {
    id: 'KDTEST03-ORDER',
    customerEmail: 'naledi.demo@kasidrop.test',
    status: 'processing',
    items: [
      { productId: 'kasi-hoodie', quantity: 1 },
      { productId: 'beanie', quantity: 1 },
    ],
    daysAgo: 5,
  },
  {
    id: 'KDTEST04-ORDER',
    customerEmail: 'thandi.demo@kasidrop.test',
    status: 'shipped',
    items: [
      { productId: 'woven-basket', quantity: 1 },
      { productId: 'ceramic-mug', quantity: 2 },
    ],
    daysAgo: 7,
  },
  {
    id: 'KDTEST05-ORDER',
    customerEmail: 'sipho.demo@kasidrop.test',
    status: 'delivered',
    items: [
      { productId: 'pottery-bowl', quantity: 1 },
      { productId: 'leather-wallet', quantity: 1 },
    ],
    daysAgo: 9,
  },
];

export function demoSeedCredentials(env: Record<string, string | undefined>) {
  if (env.SEED_DEMO_USERS !== 'true') return null;
  const adminPassword = env.SEED_DEMO_ADMIN_PASSWORD;
  const customerPassword = env.SEED_DEMO_CUSTOMER_PASSWORD;
  if (
    !adminPassword ||
    adminPassword.length < 16 ||
    !customerPassword ||
    customerPassword.length < 16
  )
    throw Error(
      'SEED_DEMO_USERS=true requires SEED_DEMO_ADMIN_PASSWORD and SEED_DEMO_CUSTOMER_PASSWORD (16+ characters each)',
    );
  if (adminPassword === customerPassword)
    throw Error('Demo admin and customer passwords must differ');
  if (env.DEMO_MODE === 'true') throw Error('SEED_DEMO_USERS=true requires DEMO_MODE=false');
  return { adminPassword, customerPassword };
}

/** These are display-only training orders, not payments or real shipments.
 * Stable order IDs and immutable seeds allow repeatable runs without duplicates.
 */
export function buildDemoOrder(fixture: DemoOrderFixture, userId: string, now: Date = new Date()) {
  const user = demoAccounts.find(
    (account) => account.email === fixture.customerEmail && account.role === 'customer',
  );
  if (!user) throw Error('Demo order must belong to a demo customer: ' + fixture.customerEmail);
  const createdAt = new Date(now.getTime() - fixture.daysAgo * 24 * 60 * 60 * 1000);
  const pricing = quote(seedProducts, fixture.items);
  return {
    id: fixture.id,
    userId,
    email: user.email,
    items: pricing.lines,
    subtotal: pricing.subtotal,
    shipping: pricing.shipping,
    total: pricing.total,
    status: fixture.status,
    paymentMethod: 'demo_seed',
    demoSeed: true,
    delivery: {
      name: user.name,
      phone: '0000000000',
      address: 'DEMO ORDER - NOT A REAL DELIVERY ADDRESS',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '0000',
    },
    createdAt,
    ...(fixture.status !== 'pending_payment'
      ? { paidAt: new Date(createdAt.getTime() + 15 * 60 * 1000) }
      : {}),
  };
}
