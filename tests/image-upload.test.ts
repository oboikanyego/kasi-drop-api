import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

// Demo mode keeps everything in memory, so the real routes run here without a database.
process.env.DEMO_MODE = 'true';
const { default: express } = await import('express');
const { registerAuthRoutes } = await import('../src/routes/auth.js');
const { registerImageRoutes } = await import('../src/routes/images.js');
const { registerAdminRoutes } = await import('../src/routes/admin.js');
const { initialize } = await import('../src/startup.js');
const { errorResponse } = await import('../src/http-error.js');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const product = (image: string) => ({
  name: 'Beaded Keyring',
  description: 'Hand-beaded keyring made in Soweto.',
  category: 'Crafts',
  price: 85,
  stock: 12,
  image,
});

let base = '';
let close = () => {};
let admin = '';
let customer = '';
before(async () => {
  await initialize();
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  registerAuthRoutes(app);
  registerImageRoutes(app);
  registerAdminRoutes(app);
  app.use((err: unknown, _req: unknown, res: import('express').Response, _next: unknown) => {
    if (err instanceof z.ZodError) return void res.status(400).json({ error: 'Validation failed' });
    const { status, body } = errorResponse(err);
    res.status(status).json(body);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  close = () => server.close();
  const session = async (path: string, body: object) =>
    (
      await fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).headers
      .getSetCookie()[0]
      .split(';')[0];
  admin = await session('/api/auth/login', {
    email: 'admin@kasidrop.test',
    password: 'Demo@12345',
  });
  customer = await session('/api/auth/register', {
    name: 'Lebo Test',
    email: 'lebo@example.com',
    password: 'Password123',
  });
});
after(() => close());

const send = (
  path: string,
  init: { method?: string; cookie?: string; type?: string; body?: BodyInit } = {},
) =>
  fetch(base + path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.cookie ? { cookie: init.cookie, 'x-kasidrop-csrf': '1' } : {}),
      ...(init.type ? { 'content-type': init.type } : {}),
    },
    body: init.body,
  });
const upload = (body: Buffer, type: string, cookie = admin) =>
  send('/api/admin/images', { method: 'POST', cookie, type, body });
const createProduct = (image: string, cookie = admin) =>
  send('/api/admin/products', {
    method: 'POST',
    cookie,
    type: 'application/json',
    body: JSON.stringify(product(image)),
  });

test('only a signed-in admin can upload', async () => {
  assert.equal(
    (await send('/api/admin/images', { method: 'POST', type: 'image/png', body: png })).status,
    401,
  );
  assert.equal((await upload(png, 'image/png', customer)).status, 403);
});
test('an uploaded photo is served to anyone, unchanged and cacheable for good', async () => {
  const res = await upload(png, 'image/png');
  assert.equal(res.status, 201);
  const { url } = (await res.json()) as { url: string };
  assert.match(url, /^\/api\/images\/[0-9a-f-]{36}$/);

  const served = await send(url); // no cookie: shoppers are not signed in
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(served.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
});
test('anything that is not really a PNG, JPEG or WebP is refused', async () => {
  assert.equal((await upload(Buffer.from('hello'), 'text/plain')).status, 415);
  assert.equal((await upload(Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 415);
  assert.equal((await upload(jpeg, 'image/png')).status, 415, 'declared type must match the bytes');
  assert.equal((await upload(Buffer.from('not an image at all'), 'image/jpeg')).status, 415);
  assert.equal((await upload(Buffer.alloc(0), 'image/png')).status, 415);
});
test('a photo over 1 MB is a clear 413, not a server error', async () => {
  const res = await upload(Buffer.concat([jpeg, Buffer.alloc(1024 * 1024)]), 'image/jpeg');
  assert.equal(res.status, 413);
  assert.match(((await res.json()) as { error: string }).error, /too large/i);
});
test('unknown or malformed photo ids are 404', async () => {
  assert.equal((await send('/api/images/not-a-uuid')).status, 404);
  assert.equal((await send('/api/images/0f8fad5b-d9cb-469f-a165-70867728950e')).status, 404);
});

test('a product can use an uploaded photo or an image link', async () => {
  const { url } = (await (await upload(jpeg, 'image/jpeg')).json()) as { url: string };
  const created = await createProduct(url);
  assert.equal(created.status, 201);
  assert.equal(((await created.json()) as { product: { image: string } }).product.image, url);
  assert.equal((await createProduct('https://images.unsplash.com/photo-1?w=800')).status, 201);
});
test('a product cannot point at a missing upload or an unsafe address', async () => {
  const missing = await createProduct('/api/images/0f8fad5b-d9cb-469f-a165-70867728950e');
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /not found/i);
  for (const bad of [
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/api/images/../etc/passwd',
    'nope',
  ])
    assert.equal((await createProduct(bad)).status, 400, bad);
});
test('changing a product photo is checked the same way', async () => {
  const { url } = (await (await upload(png, 'image/png')).json()) as { url: string };
  const patch = (image: string) =>
    send('/api/admin/products/candle', {
      method: 'PATCH',
      cookie: admin,
      type: 'application/json',
      body: JSON.stringify({ image }),
    });
  assert.equal((await patch(url)).status, 200);
  assert.equal((await patch('/api/images/0f8fad5b-d9cb-469f-a165-70867728950e')).status, 400);
});
test('malformed JSON is a 400, not a 500', async () => {
  const res = await send('/api/admin/products', {
    method: 'POST',
    cookie: admin,
    type: 'application/json',
    body: '{"name":',
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, 'Invalid request body');
});
