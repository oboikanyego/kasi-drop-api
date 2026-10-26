import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerHealthRoutes, readinessStatus } from '../src/health.js';

test('readiness: demo requires no MongoDB connection', () => {
  assert.equal(readinessStatus(true, 0), 200);
});
test('readiness: persistent mode requires connected MongoDB', () => {
  assert.equal(readinessStatus(false, 1), 200);
  for (const state of [0, 2, 3, 99]) assert.equal(readinessStatus(false, state), 503);
});
test('both endpoints are registered and liveness responds without MongoDB', async () => {
  const app = express();
  registerHealthRoutes(app);
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing TCP port');
    const response = await fetch('http://127.0.0.1:' + address.port + '/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as { status: string; service: string; uptime: number };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'kasi-drop-api');
    assert.equal(typeof body.uptime, 'number');
    const readiness = await fetch('http://127.0.0.1:' + address.port + '/api/health');
    assert.equal(readiness.status, readinessStatus(process.env.DEMO_MODE === 'true', 0));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
