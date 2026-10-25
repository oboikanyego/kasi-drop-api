import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptTimeout, canRetry, minAttemptMs } from '../src/deadline.js';
import { shoppingAssistant } from '../src/ai.js';
import { seedProducts } from '../src/catalogue.js';

test('an attempt gets its cap, cut to the time left before the deadline', () => {
  assert.equal(attemptTimeout(7000, Infinity, 0), 7000);
  assert.equal(attemptTimeout(7000, 5000, 0), 5000);
  assert.equal(attemptTimeout(7000, minAttemptMs - 1, 0), null);
});
test('a retry runs only if it still has a useful amount of time after its backoff', () => {
  assert.equal(canRetry(Infinity, 0), true);
  assert.equal(canRetry(minAttemptMs + 350, 0), true);
  assert.equal(canRetry(minAttemptMs + 349, 0), false);
});

/** A provider that never answers, but stops when its request is aborted, like a real stalled fetch. */
const hanging = (calls: string[]) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url).includes('groq') ? 'groq' : 'gemini');
    return new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
    );
  }) as typeof fetch;
const withKeys = async (run: () => Promise<void>) => {
  const before = { gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY };
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.GROQ_API_KEY = 'test-groq';
  // AbortSignal.timeout timers do not keep Node alive; in the server the HTTP listener does.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await run();
  } finally {
    clearInterval(keepAlive);
    if (before.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.gemini;
    if (before.groq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = before.groq;
  }
};

test('when both providers stall, chat answers from the catalogue within its budget', () =>
  withKeys(async () => {
    const calls: string[] = [];
    const started = Date.now();
    const result = await shoppingAssistant('tea', seedProducts, hanging(calls), 2400);
    const elapsed = Date.now() - started;
    assert.equal(result.mode, 'catalogue-fallback');
    assert.match(result.reply, /temporarily unavailable/);
    assert.ok(elapsed < 2400 + 300, 'took ' + elapsed + 'ms');
    // Gemini's retry is skipped because it would not fit; Groq still gets its turn.
    assert.deepEqual(calls, ['gemini', 'groq']);
  }));
test('a stalled Gemini still leaves Groq time to answer', () =>
  withKeys(async () => {
    const calls: string[] = [];
    const stalledGemini = hanging(calls);
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).includes('groq')) return stalledGemini(url, init);
      calls.push('groq');
      const content = JSON.stringify({ reply: 'Try rooibos', productIds: ['rooibos-tea'] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    }) as typeof fetch;
    const result = await shoppingAssistant('tea', seedProducts, fetcher, 2400);
    assert.equal(result.mode, 'groq');
    assert.deepEqual(
      result.products.map((p) => p.id),
      ['rooibos-tea'],
    );
  }));
