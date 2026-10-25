import { createHash, timingSafeEqual } from 'node:crypto';

/** Encode values in the same way as PHP's urlencode() used by PayFast. */
export function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/[!'()*~]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}
/** Preserve posted field order. For ITNs, signature terminates the signed fields. */
export function payfastSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature') break;
    if (value !== '') pairs.push(key + '=' + payfastUrlEncode(value));
  }
  if (passphrase) pairs.push('passphrase=' + payfastUrlEncode(passphrase));
  return createHash('md5').update(pairs.join('&')).digest('hex');
}
/** Uses the original form body to avoid reordering fields in middleware. */
/**
 * PayFast ITN canonical form differs from checkout: the official ITN example
 * includes blank values, and urlencodes the received values without trimming.
 * Do not apply checkout's blank-field omission or value trimming here.
 */
export function payfastItnSignature(
  fields: ReadonlyArray<readonly [string, string]>,
  passphrase: string,
): string {
  const pairs: string[] = [];
  for (const [key, value] of fields) {
    if (key === 'signature') break;
    pairs.push(key + '=' + payfastUrlEncodeRaw(value));
  }
  if (passphrase) pairs.push('passphrase=' + payfastUrlEncodeRaw(passphrase));
  return createHash('md5').update(pairs.join('&')).digest('hex');
}
function payfastUrlEncodeRaw(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}
/** Verify original ordered ITN POST fields, rejecting duplicates and malformed signatures. */
export function verifyPayfastItn(rawBody: string, passphrase: string): boolean {
  const params = new URLSearchParams(rawBody);
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();
  let signature: string | undefined;
  for (const [key, value] of params) {
    if (seen.has(key)) return false;
    seen.add(key);
    entries.push([key, value]);
    if (key === 'signature') signature = value.toLowerCase();
  }
  if (!signature || !/^[a-f0-9]{32}$/.test(signature)) return false;
  const candidate = payfastItnSignature(entries, passphrase);
  return timingSafeEqual(Buffer.from(signature, 'ascii'), Buffer.from(candidate, 'ascii'));
}
