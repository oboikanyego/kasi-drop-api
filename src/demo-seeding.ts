import bcrypt from 'bcryptjs';
import { OrderModel, UserModel } from './models.js';
import {
  demoAccounts,
  demoOrderFixtures,
  demoSeedCredentials,
  buildDemoOrder,
} from './demo-fixtures.js';

export type DemoSeedResult = {
  users: number;
  orders: number;
  createdUsers: number;
  createdOrders: number;
};

/** Safe opt-in test data for staging/demo use; never modifies existing users or orders. */
export async function seedDemoUsersAndOrders(
  env: Record<string, string | undefined> = process.env,
): Promise<DemoSeedResult> {
  const credentials = demoSeedCredentials(env);
  if (!credentials) return readDemoSeedCounts();

  await UserModel.init();
  await OrderModel.init();
  let createdUsers = 0;
  const accounts = new Map<string, string>();
  for (const account of demoAccounts) {
    const existing = await UserModel.findOne({ email: account.email });
    if (existing && (!existing.demoSeed || existing.role !== account.role))
      throw Error(
        'Cannot seed demo account: email already belongs to a different account: ' + account.email,
      );
    if (existing) {
      accounts.set(account.email, String(existing._id));
      continue;
    }
    const password =
      account.role === 'admin' ? credentials.adminPassword : credentials.customerPassword;
    const inserted = await UserModel.updateOne(
      { email: account.email },
      {
        $setOnInsert: {
          name: account.name,
          email: account.email,
          passwordHash: await bcrypt.hash(password, 12),
          role: account.role,
          demoSeed: true,
        },
      },
      { upsert: true },
    );
    createdUsers += inserted.upsertedCount;
    const saved = await UserModel.findOne({ email: account.email, demoSeed: true });
    if (!saved) throw Error('Failed to verify seeded account: ' + account.email);
    accounts.set(account.email, String(saved._id));
  }

  let createdOrders = 0;
  for (const fixture of demoOrderFixtures) {
    const userId = accounts.get(fixture.customerEmail);
    if (!userId) throw Error('Missing seeded demo customer ' + fixture.customerEmail);
    const existing = await OrderModel.findOne({ id: fixture.id });
    if (existing) {
      if (!existing.demoSeed || existing.userId !== userId)
        throw Error('Demo order ID conflicts with another order: ' + fixture.id);
      continue;
    }
    const order = buildDemoOrder(fixture, userId);
    const result = await OrderModel.updateOne(
      { id: order.id },
      { $setOnInsert: order },
      { upsert: true },
    );
    createdOrders += result.upsertedCount;
  }
  const counts = await readDemoSeedCounts();
  const summary = { ...counts, createdUsers, createdOrders };
  console.log('KasiDrop demo data seed: ' + JSON.stringify(summary));
  return summary;
}

export async function readDemoSeedCounts(): Promise<DemoSeedResult> {
  const [users, orders] = await Promise.all([
    UserModel.countDocuments({ demoSeed: true }),
    OrderModel.countDocuments({ demoSeed: true }),
  ]);
  return { users, orders, createdUsers: 0, createdOrders: 0 };
}
