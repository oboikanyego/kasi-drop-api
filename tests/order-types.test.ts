import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderModel } from '../src/models.js';
import { buildDemoOrder, demoOrderFixtures } from '../src/demo-fixtures.js';
import { orderStatuses } from '../src/order-rules.js';
import { expiryTransition, needsReview, paymentTransition } from '../src/reservations.js';

const validate = (order: object) => new OrderModel(order).validateSync();
const sample = () => buildDemoOrder(demoOrderFixtures[0], '507f1f77bcf86cd799439011');

test('every seeded demo order passes the order schema', () => {
  for (const fixture of demoOrderFixtures)
    assert.equal(
      validate(buildDemoOrder(fixture, '507f1f77bcf86cd799439011')),
      undefined,
      fixture.id,
    );
});
test('the schema rejects unknown or missing statuses and payment methods', () => {
  assert.ok(validate({ ...sample(), status: 'shipped_maybe' })?.errors.status);
  assert.ok(validate({ ...sample(), status: undefined })?.errors.status);
  assert.ok(validate({ ...sample(), paymentMethod: 'cash' })?.errors.paymentMethod);
});
test('every reservation transition targets a status the schema accepts', () => {
  const order = {
    status: 'pending_payment',
    paymentMethod: 'payfast',
    stockReserved: true,
    createdAt: new Date(),
  };
  const targets = [
    paymentTransition(order, 'COMPLETE'),
    paymentTransition(order, 'FAILED'),
    needsReview(),
    expiryTransition(),
  ].map((t) => t!.changes.status);
  for (const status of targets) assert.ok(orderStatuses.includes(status), status);
});
