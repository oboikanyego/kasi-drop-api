import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paymentTransition,
  reservationExpired,
  expiryTransition,
  needsReview,
} from '../src/reservations.js';
const now = new Date('2026-10-25T12:00:00Z');
const order = (over: Record<string, unknown> = {}) => ({
  status: 'pending_payment',
  paymentMethod: 'payfast',
  stockReserved: true,
  createdAt: new Date('2026-10-25T11:50:00Z'),
  ...over,
});
test('COMPLETE on a reserved order marks it paid without touching stock again', () => {
  assert.deepEqual(paymentTransition(order(), 'COMPLETE', now), {
    changes: { status: 'paid', stockReserved: true, paidAt: now },
    stock: 'none',
  });
});
test('COMPLETE after the reservation expired takes stock again', () => {
  assert.equal(
    paymentTransition(order({ status: 'expired', stockReserved: false }), 'COMPLETE', now)?.stock,
    'reserve',
  );
});
test('COMPLETE on an order created before reservations takes stock', () => {
  assert.equal(
    paymentTransition(order({ stockReserved: undefined }), 'COMPLETE', now)?.stock,
    'reserve',
  );
});
test('FAILED or CANCELLED releases held stock exactly when it is held', () => {
  for (const status of ['FAILED', 'CANCELLED']) {
    assert.deepEqual(paymentTransition(order(), status, now), {
      changes: { status: 'failed', stockReserved: false },
      stock: 'release',
    });
    assert.equal(
      paymentTransition(order({ status: 'expired', stockReserved: false }), status, now)?.stock,
      'none',
    );
  }
});
test('settled orders and unknown payment statuses do not change', () => {
  for (const status of ['paid', 'failed', 'requires_review', 'processing', 'demo_paid'])
    assert.equal(paymentTransition(order({ status }), 'COMPLETE', now), null);
  assert.equal(paymentTransition(order(), 'PENDING', now), null);
});
test('only reserved, unpaid PayFast orders past the window expire', () => {
  const old = { createdAt: new Date('2026-10-25T11:29:00Z') };
  assert.equal(reservationExpired(order(old), now, 30), true);
  assert.equal(reservationExpired(order(), now, 30), false);
  assert.equal(reservationExpired(order({ ...old, stockReserved: false }), now, 30), false);
  assert.equal(reservationExpired(order({ ...old, status: 'paid' }), now, 30), false);
  assert.equal(reservationExpired(order({ ...old, paymentMethod: 'demo' }), now, 30), false);
  assert.deepEqual(expiryTransition(), {
    changes: { status: 'expired', stockReserved: false },
    stock: 'release',
  });
  assert.deepEqual(needsReview(), {
    changes: { status: 'requires_review', stockReserved: false },
    stock: 'none',
  });
});
