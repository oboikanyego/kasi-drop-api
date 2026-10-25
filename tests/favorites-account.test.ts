import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './source.js';
const server = readSource('src/server.ts');
const models = readSource('src/models.ts');
test('favourites API requires authenticated identity for every operation', () => {
  for (const route of [
    "get('/api/favorites'",
    "put('/api/favorites/:productId'",
    "delete('/api/favorites/:productId'",
    "post('/api/favorites/merge'",
  ]) {
    assert.ok(server.includes('app.' + route + ',guard()'), route);
  }
  assert.match(server, /const userId=identity\(req\)!\.sub/);
  assert.match(models, /favoriteProductIds:\{type:\[String\],default:\[\]\}/);
});
test('atomic account-scoped mutations protect other users', () => {
  assert.match(server, /UserModel\.findByIdAndUpdate\(userId,update,\{new:true\}\)/);
  assert.match(server, /\$addToSet:\{favoriteProductIds:productId\}/);
  assert.match(server, /\$pull:\{favoriteProductIds:productId\}/);
  assert.match(server, /\$addToSet:\{favoriteProductIds:\{\$each:valid\}\}/);
});
test('guest merge validates available catalogue IDs', () => {
  assert.match(server, /new Set\(favoritesMergeSchema\.parse\(req\.body\)\.productIds\)/);
  assert.match(server, /ids\.filter\(id=>available\.has\(id\)\)/);
});
