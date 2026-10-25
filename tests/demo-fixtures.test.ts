import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoAccounts,
  demoOrderFixtures,
  demoSeedCredentials,
  buildDemoOrder,
} from '../src/demo-fixtures.js';

test('seeds exactly one admin, three customers and five uniquely identified orders', () => {
  assert.equal(demoAccounts.filter((x) => x.role === 'admin').length, 1);
  assert.equal(demoAccounts.filter((x) => x.role === 'customer').length, 3);
  assert.equal(new Set(demoAccounts.map((x) => x.email)).size, 4);
  assert.equal(demoOrderFixtures.length, 5);
  assert.equal(new Set(demoOrderFixtures.map((x) => x.id)).size, 5);
  assert.deepEqual(
    demoOrderFixtures.map((x) => x.status),
    ['pending_payment', 'paid', 'processing', 'shipped', 'delivered'],
  );
});
test('demo seeding requires an explicit opt-in and strong distinct passwords', () => {
  assert.equal(demoSeedCredentials({}), null);
  assert.equal(demoSeedCredentials({ SEED_DEMO_USERS: 'false' }), null);
  assert.throws(() => demoSeedCredentials({ SEED_DEMO_USERS: 'true' }), /16\+ characters/);
  assert.throws(
    () =>
      demoSeedCredentials({
        SEED_DEMO_USERS: 'true',
        DEMO_MODE: 'false',
        SEED_DEMO_ADMIN_PASSWORD: 'verylongpassword000',
        SEED_DEMO_CUSTOMER_PASSWORD: 'verylongpassword000',
      }),
    /must differ/,
  );
  assert.throws(
    () =>
      demoSeedCredentials({
        SEED_DEMO_USERS: 'true',
        DEMO_MODE: 'true',
        SEED_DEMO_ADMIN_PASSWORD: 'verylongpassword000',
        SEED_DEMO_CUSTOMER_PASSWORD: 'differentpassword000',
      }),
    /DEMO_MODE=false/,
  );
  assert.ok(
    demoSeedCredentials({
      SEED_DEMO_USERS: 'true',
      DEMO_MODE: 'false',
      SEED_DEMO_ADMIN_PASSWORD: 'verylongpassword000',
      SEED_DEMO_CUSTOMER_PASSWORD: 'differentpassword000',
    }),
  );
});
test('orders are labelled as demo data, priced correctly, and use synthetic addresses', () => {
  for (const fixture of demoOrderFixtures) {
    const order = buildDemoOrder(fixture, 'demo-user-id', new Date('2026-10-25T10:00:00Z'));
    assert.equal(order.id, fixture.id);
    assert.equal(order.status, fixture.status);
    assert.equal(order.demoSeed, true);
    assert.equal(order.paymentMethod, 'demo_seed');
    assert.equal(order.userId, 'demo-user-id');
    assert.ok(order.items.length > 0);
    assert.ok(order.total > 0);
    assert.equal(order.total, order.subtotal + order.shipping);
    assert.match(order.delivery.address, /NOT A REAL/);
    assert.ok(order.createdAt.getTime() < Date.parse('2026-10-25T10:00:00Z'));
    assert.equal('paidAt' in order, fixture.status !== 'pending_payment');
  }
});
