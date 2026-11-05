import test from 'node:test';
import assert from 'node:assert/strict';
import { r2Config, signedR2Request } from '../src/r2-store.js';
import { deploymentReadiness } from '../src/deployment-readiness.js';

test('R2 requires all credentials together and never exposes secrets in public URL', () => {
  assert.equal(r2Config({}), null);
  assert.throws(() => r2Config({ R2_BUCKET: 'kasidrop-pics' }));
  const config = { accountId: 'a'.repeat(32), bucket: 'kasidrop-pics', accessKeyId: 'example-key', secretAccessKey: 'secret-test-only' };
  const req = signedR2Request('PUT', 'example-id', Buffer.from('hello'), 'image/png', new Date('2026-11-05T09:00:00Z'), config);
  assert.equal(req.url, 'https://' + config.accountId + '.r2.cloudflarestorage.com/kasidrop-pics/images/example-id');
  assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 Credential=example-key\//);
  assert.equal(req.headers['content-type'], 'image/png');
  assert.ok(!JSON.stringify(req).includes(config.secretAccessKey));
});
test('launch readiness does not claim to support real payments', () => {
  const env = {
    DEMO_MODE: 'false',
    PUBLIC_API_URL: 'https://kasi-drop-api-9rdp.onrender.com',
    CLIENT_URL: 'https://kasi-drop.netlify.app',
    PAYFAST_MODE: 'sandbox', PAYFAST_MERCHANT_ID: '10004002', PAYFAST_MERCHANT_KEY: 'sandbox-key',
    PAYFAST_PASSPHRASE: 'test-secret', JWT_SECRET: 'test-only', MONGODB_URI: 'mongodb://localhost',
    MONGODB_DB_NAME: 'test',
  };
  const result = deploymentReadiness(env);
  assert.equal(result.acceptsRealPayments, false);
  assert.equal(result.sandboxReady, true);
  assert.equal(result.deployable, true);
  const noGateway = deploymentReadiness({ ...env, PAYFAST_MODE: 'live' });
  assert.equal(noGateway.acceptsRealPayments, false);
  assert.equal(noGateway.sandboxReady, false);
  assert.ok(noGateway.issues.length);
});
