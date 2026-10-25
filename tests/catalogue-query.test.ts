import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueFilter, catalogueSort, escapeRegex, pagination } from '../src/catalogue-query.js';

test('empty search only filters to active products', () => {
  assert.deepEqual(catalogueFilter(), { active: true });
  assert.deepEqual(catalogueFilter('', 'All'), { active: true });
});
test('category and max price become exact filters', () => {
  assert.deepEqual(catalogueFilter('', 'Crafts', 250), {
    active: true,
    category: 'Crafts',
    price: { $lte: 250 },
  });
});
test('search words and their synonyms match any text field, case-insensitively', () => {
  const filter = catalogueFilter('Braai') as { $or: Record<string, RegExp>[] };
  assert.deepEqual(
    filter.$or.map((clause) => Object.keys(clause)[0]),
    ['name', 'description', 'category', 'tags'],
  );
  const pattern = filter.$or[0].name;
  assert.equal(pattern.flags, 'i');
  for (const word of ['braai', 'BILTONG', 'chilli', 'sauce']) assert.ok(pattern.test(word), word);
});
test('shopper input cannot inject regular expression syntax', () => {
  assert.equal(escapeRegex('a.b*(c)|[d]$'), 'a\\.b\\*\\(c\\)\\|\\[d\\]\\$');
  const pattern = (catalogueFilter('.*') as { $or: Record<string, RegExp>[] }).$or[0].name;
  assert.equal(pattern.test('anything'), false);
  assert.equal(pattern.test('literal .* text'), true);
});
test('sorts match the catalogue options with a stable tiebreak', () => {
  assert.deepEqual(catalogueSort('price-asc'), { price: 1, _id: 1 });
  assert.deepEqual(catalogueSort('price-desc'), { price: -1, _id: 1 });
  assert.deepEqual(catalogueSort('featured'), { featured: -1, _id: 1 });
  assert.deepEqual(catalogueSort('anything-else'), { featured: -1, _id: 1 });
});
test('pagination defaults to the first page of 100 and rejects bad input', () => {
  assert.deepEqual(pagination(undefined, undefined), { pageSize: 100, pageNumber: 1, skip: 0 });
  assert.deepEqual(pagination('3', '20'), { pageSize: 20, pageNumber: 3, skip: 40 });
  for (const [page, limit] of [
    ['0', '0'],
    ['-2', '500'],
    ['abc', 'x'],
  ])
    assert.deepEqual(pagination(page, limit), { pageSize: 100, pageNumber: 1, skip: 0 });
});
