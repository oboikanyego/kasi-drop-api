import assert from 'node:assert/strict';
import test from 'node:test';
import { shoppingAssistant } from '../src/ai.js';
import { seedProducts } from '../src/catalogue.js';

test('the shopper request starts on its own line after the catalogue', async () => {
  const before = { gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY };
  process.env.GEMINI_API_KEY = 'test-gemini';
  delete process.env.GROQ_API_KEY;
  let prompt = '';
  try {
    await shoppingAssistant('tea for my gran', seedProducts, (async (_url, init) => {
      prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text;
      const text = JSON.stringify({ reply: 'Try rooibos', productIds: ['rooibos-tea'] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    }) as typeof fetch);
  } finally {
    if (before.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.gemini;
    if (before.groq !== undefined) process.env.GROQ_API_KEY = before.groq;
  }
  assert.match(prompt, /^CATALOGUE: \[.*\]\nSHOPPER REQUEST: tea for my gran$/s);
  assert.ok(!prompt.includes('\\n'), 'prompt contains a literal backslash-n');
});
