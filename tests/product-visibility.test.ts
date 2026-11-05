import test from 'node:test';
import assert from 'node:assert/strict';
import { seedProducts, searchCatalogue, quote } from '../src/catalogue.js';
import { catalogueFilter } from '../src/catalogue-query.js';
import { readSource } from './source.js';

const hidden = seedProducts.map((product) =>
  product.id === 'candle' ? { ...product, active: false } : product,
);

test('hidden products are excluded from public catalogue and search', () => {
  assert.equal(
    searchCatalogue(hidden).some((product) => product.id === 'candle'),
    false,
  );
  assert.equal(
    searchCatalogue(hidden, 'candle').some((product) => product.id === 'candle'),
    false,
  );
  assert.deepEqual(catalogueFilter(), { active: true });
});

test('hidden product cannot be ordered even from an old cart', () => {
  assert.throws(() => quote(hidden, [{ productId: 'candle', quantity: 1 }]), /Product not found/);
});

test('admin can list and update inactive products without deleting them', () => {
  const routes = readSource('src/routes/admin.ts');
  assert.match(routes, /'\/api\/admin\/products'/);
  assert.match(routes, /guard\('admin'\)/);
  assert.match(routes, /ProductModel\.find\(\)/);
  assert.match(routes, /productSchema\.partial\(\)/);
  assert.match(routes, /findOneAndUpdate/);
});

test('AI catalogue excludes inactive demo products', () => {
  const source = readSource('src/catalogue-store.ts');
  assert.ok(source.includes('memProducts.filter(product=>product.active)'));
  assert.ok(source.includes('ProductModel.find({active:true})'));
});
