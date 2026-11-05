import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inventoryParamsSchema,
  inventoryFilter,
  inventorySort,
  filterDemoInventory,
} from '../src/inventory-filter.js';
import { seedProducts } from '../src/catalogue.js';

const params = (input: Record<string, unknown> = {}) => inventoryParamsSchema.parse(input);

test('inventory admin filters search and stock before pagination', () => {
  const p = params({
    q: 'candle',
    visibility: 'active',
    category: 'Home & Living',
    stock: 'available',
    featured: 'no',
    sort: 'price-asc',
    page: '2',
  });
  assert.equal(p.page, 2);
  const db = inventoryFilter(p);
  assert.equal(db.active, true);
  assert.equal(db.category, 'Home & Living');
  assert.deepEqual(db.stock, { $gt: 5 });
  assert.equal(db.featured, false);
  assert.deepEqual(inventorySort(p.sort), { price: 1, _id: -1 });
  const results = filterDemoInventory(seedProducts, { ...p, page: 1 });
  assert.ok(results.length > 0);
  assert.ok(
    results.every((x) => x.name.toLowerCase().includes('candle') && x.stock > 5 && !x.featured),
  );
});

test('admin can search inactive products but public catalogue still excludes them', () => {
  const products = [{ ...seedProducts[0], active: false, stock: 0 }, ...seedProducts.slice(1)];
  const p = params({ q: seedProducts[0].id, visibility: 'hidden', stock: 'out' });
  assert.equal(filterDemoInventory(products, p).length, 1);
  assert.equal(
    filterDemoInventory(products, params({ visibility: 'active' })).some(
      (x) => x.id === seedProducts[0].id,
    ),
    false,
  );
});

test('special regex characters are escaped in database search and invalid params rejected', () => {
  const pattern = (inventoryFilter(params({ q: 'a.*[b]' })).$or as Array<Record<string, RegExp>>)[0]
    .name;
  assert.equal(pattern.test('aZb'), false);
  assert.equal(pattern.test('literal a.*[b] name'), true);
  assert.throws(() => params({ stock: 'everything' }));
  assert.throws(() => params({ q: 'x'.repeat(121) }));
  assert.throws(() => params({ page: -1 }));
});

test('demo inventory sorts numerical prices and stock levels', () => {
  const prices = filterDemoInventory(seedProducts, params({ sort: 'price-asc' }));
  assert.ok(prices.every((x, i) => !i || prices[i - 1].price <= x.price));
  const stocks = filterDemoInventory(seedProducts, params({ sort: 'stock-desc' }));
  assert.ok(stocks.every((x, i) => !i || stocks[i - 1].stock >= x.stock));
});
