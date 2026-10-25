import assert from 'node:assert/strict';
import test from 'node:test';
import {
  legacySeedProducts,
  retailSeedProducts,
  planDemoCatalogueRefresh,
} from '../src/demo-catalogue-refresh.js';
test('refresh only targets original legacy seed IDs, not new mock products', () => {
  assert.equal(legacySeedProducts.length, 12);
  assert.equal(retailSeedProducts.length, 12);
  const plan = planDemoCatalogueRefresh([...legacySeedProducts, ...retailSeedProducts], new Set());
  assert.equal(plan.filter((x) => x.operation === 'retire').length, 12);
  assert.ok(plan.every((x) => !x.id.startsWith('mock-')));
});
test('manually changed price image stock and activity are protected', () => {
  const items = legacySeedProducts.map((p, i) =>
    i === 0
      ? { ...p, price: p.price + 10 }
      : i === 1
        ? { ...p, image: 'https://example.com/own.jpg' }
        : i === 2
          ? { ...p, stock: p.stock - 1 }
          : i === 3
            ? { ...p, active: false }
            : p,
  );
  const plan = planDemoCatalogueRefresh(items, new Set());
  for (let i = 0; i < 4; i++) assert.equal(plan[i].operation, 'skip');
});
test('unsettled orders protect referenced products; missing products are skipped', () => {
  const plan = planDemoCatalogueRefresh(
    legacySeedProducts.slice(1),
    new Set([legacySeedProducts[1].id]),
  );
  assert.equal(plan[0].operation, 'skip');
  assert.equal(plan[1].operation, 'skip');
  assert.equal(plan[2].operation, 'retire');
});
test('idempotence: already retired legacy product is skipped', () => {
  const items = legacySeedProducts.map((p) => ({ ...p, active: false }));
  assert.ok(planDemoCatalogueRefresh(items, new Set()).every((a) => a.operation === 'skip'));
});
