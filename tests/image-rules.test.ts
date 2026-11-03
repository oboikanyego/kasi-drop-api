import assert from 'node:assert/strict';
import test from 'node:test';
import { imagePath, isImageReference, uploadedImageId } from '../src/image-rules.js';
import { errorResponse } from '../src/http-error.js';

const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('an uploaded photo is recognised by its path', () => {
  assert.equal(uploadedImageId(imagePath(id)), id);
  for (const other of [
    '/api/images/not-a-uuid',
    '/api/images/' + id + '/extra',
    '/api/images/../' + id,
    'https://example.com/api/images/' + id,
    '/api/images/' + 'g'.repeat(36),
    '',
  ])
    assert.equal(uploadedImageId(other), null, other);
});
test('a product image is an uploaded photo or an http(s) link, nothing else', () => {
  for (const ok of [
    imagePath(id),
    'https://images.unsplash.com/photo-1?w=800',
    'http://example.com/a.jpg',
  ])
    assert.equal(isImageReference(ok), true, ok);
  for (const bad of [
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://example.com/a.jpg',
    '/etc/passwd',
    '/api/images/not-a-uuid',
    'not a url',
    '',
  ])
    assert.equal(isImageReference(bad), false, bad);
});
test('oversized or malformed request bodies are client errors, not 500s', () => {
  assert.deepEqual(errorResponse({ status: 413, expose: true, type: 'entity.too.large' }), {
    status: 413,
    body: { error: 'Request body is too large' },
  });
  assert.deepEqual(errorResponse({ status: 400, expose: true, type: 'entity.parse.failed' }), {
    status: 400,
    body: { error: 'Invalid request body' },
  });
  // Only errors that mark themselves safe to expose, and only 4xx, are passed through.
  assert.equal(errorResponse({ status: 400 }).status, 500);
  assert.equal(errorResponse({ status: 500, expose: true }).status, 500);
  assert.equal(errorResponse(new Error('boom')).status, 500);
});

test('photo downloads and PayFast callbacks skip the shopper rate limit, everything else counts', async () => {
  const { skipsShopperLimit } = await import('../src/http.js');
  assert.equal(skipsShopperLimit('GET', '/images/' + id), true);
  assert.equal(skipsShopperLimit('POST', '/payfast/notify'), true);
  // Uploads are admin-only and have their own limit; other methods and paths are shopper traffic.
  assert.equal(skipsShopperLimit('POST', '/images/' + id), false);
  assert.equal(skipsShopperLimit('GET', '/products'), false);
  assert.equal(skipsShopperLimit('GET', '/admin/images'), false);
});
