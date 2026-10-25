import { seedProducts } from '../src/catalogue.js';

/** Live remote image smoke test. Kept separate from unit tests because CDNs can briefly fail. */
async function check(url: string): Promise<{ url: string; ok: boolean; detail: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { range: 'bytes=0-1023', accept: 'image/*' },
        signal: AbortSignal.timeout(12000),
      });
      const type = response.headers.get('content-type') || '';
      if (response.ok && type.startsWith('image/')) {
        await response.body?.cancel();
        return { url, ok: true, detail: response.status + ' ' + type };
      }
      await response.body?.cancel();
      if (response.status === 404 || response.status === 400)
        return { url, ok: false, detail: response.status + ' ' + type };
    } catch (error) {
      if (attempt === 2)
        return { url, ok: false, detail: error instanceof Error ? error.name : 'network-error' };
    }
    await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
  }
  return { url, ok: false, detail: 'unreachable/non-image' };
}
async function main() {
  const urls = [...new Set(seedProducts.map((p) => p.image))];
  const results: Awaited<ReturnType<typeof check>>[] = [];
  // Limit concurrency to avoid overwhelming a free image CDN.
  for (let i = 0; i < urls.length; i += 3) {
    results.push(...(await Promise.all(urls.slice(i, i + 3).map(check))));
  }
  for (const result of results)
    console.log((result.ok ? 'OK ' : 'FAIL ') + result.detail + ' ' + result.url);
  const failed = results.filter((r) => !r.ok);
  console.log(
    'Catalogue photos: ' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ' unique URLs returned images.',
  );
  if (failed.length) process.exitCode = 1;
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
