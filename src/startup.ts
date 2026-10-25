import bcrypt from 'bcryptjs';
import { seedProducts } from './catalogue.js';
import { connectMongo } from './db.js';
import { seedCatalogue, type CatalogueSeedSummary } from './seeding.js';
import { seedDemoUsersAndOrders, type DemoSeedResult } from './demo-seeding.js';
import { demo, memUsers } from './state.js';

// Reported by GET /health once startup has run.
export let seedStatus: CatalogueSeedSummary | undefined;
export let demoSeedStatus: DemoSeedResult | undefined;
export async function initialize() {
  if (demo) {
    memUsers.push({
      id: 'admin-demo',
      name: 'Demo Admin',
      email: 'admin@kasidrop.test',
      passwordHash: await bcrypt.hash('Demo@12345', 10),
      role: 'admin',
    });
    memUsers.push({
      id: 'customer-demo',
      name: 'Demo Shopper',
      email: 'shopper@kasidrop.test',
      passwordHash: await bcrypt.hash('Demo@12345', 10),
      role: 'customer',
    });
    console.log(
      'DEMO MODE: ' +
        seedProducts.length +
        ' temporary catalogue products, simulated checkout; no MongoDB writes.',
    );
  } else {
    await connectMongo();
    // Idempotent: inserts missing catalogue products and preserves all existing edits.
    seedStatus = await seedCatalogue();
    // Demo fixtures are opt-in and use credentials supplied only in server env vars.
    demoSeedStatus = await seedDemoUsersAndOrders();
  }
}
