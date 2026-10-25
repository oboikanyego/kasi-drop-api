import test from 'node:test';
import assert from 'node:assert/strict';
import { groqJson } from '../src/groq.js';
test('Groq endpoint sends configured model and private bearer key', async () => {
  const old = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  try {
    const data = await groqJson('Return JSON', 'hello', async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer test-only');
      assert.equal(
        JSON.parse(String(init?.body)).model,
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      );
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
      });
    });
    assert.deepEqual(data, { ok: true });
  } finally {
    if (old === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = old;
  }
});

import { shoppingAssistant } from '../src/ai.js';
import { seedProducts } from '../src/catalogue.js';
test('Gemini 503 routes to Groq and validates catalogue references', async () => {
  const beforeG = process.env.GEMINI_API_KEY,
    beforeR = process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'test';
  process.env.GROQ_API_KEY = 'test';
  const first = seedProducts.find((p) => p.active && p.stock > 0)!;
  let calls = 0;
  try {
    const result = await shoppingAssistant('local product', seedProducts, async (url) => {
      if (String(url).includes('generativelanguage')) {
        calls++;
        return new Response('{}', { status: 503 });
      }
      calls++;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Try this',
                  productIds: [first.id, 'made-up-product'],
                  cartActions: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    assert.equal(calls, 3);
    assert.equal(result.mode, 'groq');
    assert.deepEqual(
      result.products.map((p) => p.id),
      [first.id],
    );
  } finally {
    if (beforeG === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = beforeG;
    if (beforeR === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = beforeR;
  }
});
test('Both providers unavailable return catalogue fallback with no cart edits', async () => {
  const beforeG = process.env.GEMINI_API_KEY,
    beforeR = process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'test';
  process.env.GROQ_API_KEY = 'test';
  try {
    const result = await shoppingAssistant(
      'tea',
      seedProducts,
      async () => new Response('{}', { status: 503 }),
    );
    assert.equal(result.mode, 'catalogue-fallback');
    assert.deepEqual(result.cartActions, []);
  } finally {
    if (beforeG === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = beforeG;
    if (beforeR === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = beforeR;
  }
});
