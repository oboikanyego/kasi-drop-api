import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './source.js';

const source = readSource('src/insights.ts');
const server = readSource('src/server.ts');
test('analytics accepts only explicit event names and non-sensitive page groups', () => {
  for (const name of [
    'page_view',
    'product_search',
    'ai_chat',
    'add_to_cart',
    'checkout_started',
    'checkout_created',
    'api_error',
  ]) {
    assert.ok(source.includes("'" + name + "'"), name);
  }
  assert.match(source, /z\.object\(/);
  assert.doesNotMatch(source, /ipAddress:|userId:|prompt:|query:/);
});
test('feedback has limits, rate limiting and safe admin access', () => {
  assert.match(source, /min\(10\)\.max\(1500\)/);
  assert.match(source, /limit: 30/);
  assert.match(source, /guard\('admin'\)/);
  assert.match(source, /limit\(100\)/);
});
test('analytics expires and API error counts avoid sensitive payloads', () => {
  assert.match(source, /expires: 60 \* 60 \* 24 \* 90/);
  assert.match(server, /recordApiError/);
  assert.match(server, /res\.statusCode >= 500/);
});
