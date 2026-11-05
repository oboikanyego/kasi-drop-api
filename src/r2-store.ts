import { createHash, createHmac } from 'node:crypto';

/** Optional Cloudflare R2, using the S3 REST signing protocol without additional dependencies. */
export function r2Config(env: NodeJS.ProcessEnv = process.env) {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId && !bucket && !accessKeyId && !secretAccessKey) return null;
  if (
    !accountId ||
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  )
    throw Error(
      'Cloudflare R2 configuration incomplete: check R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY',
    );
  return { accountId, bucket, accessKeyId, secretAccessKey };
}
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data).digest();
const enc = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase(),
  );

export function signedR2Request(
  method: 'PUT' | 'GET' | 'HEAD',
  id: string,
  body?: Buffer,
  mime?: string,
  now = new Date(),
  config = r2Config(),
) {
  if (!config) throw Error('R2 is not configured');
  const host = config.accountId + '.r2.cloudflarestorage.com';
  const path = '/' + enc(config.bucket) + '/images/' + enc(id);
  const datetime = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = datetime.slice(0, 8);
  const payloadHash = sha256(body ?? '');
  const headers: Record<string, string> = {
    host,
    'x-amz-date': datetime,
    'x-amz-content-sha256': payloadHash,
  };
  if (body && mime) headers['content-type'] = mime;
  const sorted = Object.keys(headers).sort();
  const canonical = sorted.map((k) => k + ':' + headers[k].trim() + '\n').join('');
  const signedHeaders = sorted.join(';');
  const scope = date + '/auto/s3/aws4_request';
  const canonicalRequest = [method, path, '', canonical, signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(
    hmac(hmac(hmac('AWS4' + config.secretAccessKey, date), 'auto'), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  headers.authorization =
    'AWS4-HMAC-SHA256 Credential=' +
    config.accessKeyId +
    '/' +
    scope +
    ', SignedHeaders=' +
    signedHeaders +
    ', Signature=' +
    signature;
  delete headers.host; // fetch sets the Host header based on URL
  return { url: 'https://' + host + path, headers, body };
}
export async function r2Write(id: string, bytes: Buffer, mime: string): Promise<void> {
  const request = signedR2Request('PUT', id, bytes, mime);
  const response = await fetch(request.url, {
    method: 'PUT',
    headers: request.headers,
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('R2 upload failed with HTTP ' + response.status);
}
export async function r2Read(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const request = signedR2Request('GET', id);
  const response = await fetch(request.url, {
    method: 'GET',
    headers: request.headers,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error('R2 image read failed with HTTP ' + response.status);
  const mime = (response.headers.get('content-type') || '').split(';')[0];
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
    throw Error('R2 returned unexpected content type');
  return { mime, bytes: Buffer.from(await response.arrayBuffer()) };
}
export async function r2Exists(id: string): Promise<boolean> {
  const request = signedR2Request('HEAD', id);
  const response = await fetch(request.url, {
    method: 'HEAD',
    headers: request.headers,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw Error('R2 image lookup failed with HTTP ' + response.status);
  return true;
}
