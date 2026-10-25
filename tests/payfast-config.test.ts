import assert from 'node:assert/strict';
import test from 'node:test';
import { payfastConfig, payfastConfigured } from '../src/payfast-config.js';
import { quote, seedProducts, shippingRule } from '../src/catalogue.js';

const complete = {
  PAYFAST_MERCHANT_ID: '10000100',
  PAYFAST_MERCHANT_KEY: 'key',
  PAYFAST_PASSPHRASE: 'phrase',
  PAYFAST_MODE: 'sandbox',
};
test('PayFast is configured only with every value set in sandbox mode', () => {
  assert.deepEqual(payfastConfig(complete), {
    merchantId: '10000100',
    merchantKey: 'key',
    passphrase: 'phrase',
  });
  for (const key of Object.keys(complete))
    assert.equal(payfastConfigured({ ...complete, [key]: '' }), false, key + ' missing');
  assert.equal(payfastConfigured({ ...complete, PAYFAST_MODE: 'live' }), false);
});
test('quote charges exactly the published shipping rule', () => {
  // Rooibos tea is R129: 5 = R645 pays the fee, 6 = R774 is past the free-delivery threshold.
  assert.equal(shippingRule.freeFromCents, 75000);
  assert.equal(
    quote(seedProducts, [{ productId: 'rooibos-tea', quantity: 5 }]).shipping,
    shippingRule.feeCents / 100,
  );
  assert.equal(quote(seedProducts, [{ productId: 'rooibos-tea', quantity: 6 }]).shipping, 0);
});
