import test from 'node:test';
import assert from 'node:assert/strict';
import {generateGemini,shoppingAssistant,draftListing,GeminiError,geminiConfigured} from '../src/ai.js';
import {seedProducts} from '../src/catalogue.js';

test('uses grounded catalogue fallback without key',async()=>{
 const original=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 try{const result=await shoppingAssistant('tea',seedProducts);assert.equal(result.mode,'catalogue-fallback');assert.deepEqual(result.cartActions,[]);}
 finally{if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
});
test('Gemini request sets x-goog-api-key and free-tier model without disclosing key in URL',async()=>{
 const oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_MODEL;
 process.env.GEMINI_API_KEY='test-secret';delete process.env.GEMINI_MODEL;
 try{
  const result=await generateGemini({contents:[{role:'user',parts:[{text:'hi'}]}]},async(input,init)=>{
   assert.match(String(input),/gemini-3\.1-flash-lite:generateContent/);
   assert.ok(!String(input).includes('test-secret'));
   assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'test-secret');
   return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'hello'}]}}]}),{status:200});
  });
  assert.equal(result.candidates?.[0]?.content?.parts?.[0]?.text,'hello');
 }finally{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=oldModel;}
});
test('provider quota failure returns an explicit error',async()=>{
 const oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-secret';
 try{await assert.rejects(()=>generateGemini({},async()=>new Response('{}',{status:429})),(err:unknown)=>err instanceof GeminiError&&err.status===429);}
 finally{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});
test('listing generator fails with meaningful configuration error when key absent',async()=>{
 const original=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 try{assert.equal(geminiConfigured(),false);await assert.rejects(()=>draftListing({name:'Example',notes:'Local',category:'Crafts'}),/GEMINI_API_KEY/);}
 finally{if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
});

test('a restricted Gemini model returns a clear 404 diagnostic',async()=>{
 const oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_MODEL;
 process.env.GEMINI_API_KEY='test-secret';process.env.GEMINI_MODEL='gemini-2.5-flash-lite';
 try{await assert.rejects(()=>generateGemini({contents:[]},async()=>new Response('{}',{status:404})),(err:unknown)=>err instanceof GeminiError&&err.status===404&&/model not available/.test(err.message));}
 finally{
  if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;
  if(oldModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=oldModel;
 }
});

test('single-call shopping responses only return real available products',async()=>{
 const {validatedShoppingResult}=await import('../src/ai.js');
 const first=seedProducts.find(p=>p.active&&p.stock>0);
 assert.ok(first);
 const result=validatedShoppingResult({reply:'Local picks',productIds:[first.id,'made-up-id'],cartActions:[{productId:'made-up-id',quantity:1}]},seedProducts);
 assert.deepEqual(result.products.map(p=>p.id),[first.id]);
 assert.deepEqual(result.cartActions,[]);
 assert.equal(result.mode,'gemini');
});
test('cart actions reject fractional, negative, missing and overstock quantities',async()=>{
 const {validatedShoppingResult}=await import('../src/ai.js');
 const first=seedProducts.find(p=>p.active&&p.stock>0);
 assert.ok(first);
 const requests=[{productId:first.id,quantity:-1},{productId:first.id,quantity:1.5},{productId:first.id,quantity:9999},{productId:'nonexistent',quantity:1},{productId:first.id,quantity:1}];
 const result=validatedShoppingResult({reply:'Added',cartActions:requests},seedProducts);
 assert.deepEqual(result.cartActions,[{productId:first.id,quantity:1}]);
});
test('empty or untrusted result is safe',async()=>{
 const {validatedShoppingResult}=await import('../src/ai.js');
 const result=validatedShoppingResult({reply:123,productIds:[12,null],cartActions:'hack'},seedProducts);
 assert.equal(typeof result.reply,'string');
 assert.deepEqual(result.products,[]);
 assert.deepEqual(result.cartActions,[]);
});

test('Gemini retries one 503 and succeeds',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-secret';
 let attempts=0;
 try{
  const result=await generateGemini({contents:[]},async()=>{
   attempts++;
   return attempts===1?new Response('{}',{status:503}):new Response(JSON.stringify({candidates:[{content:{parts:[{text:'OK'}]}}]}),{status:200});
  });
  assert.equal(attempts,2);
  assert.equal(result.candidates?.[0]?.content?.parts?.[0]?.text,'OK');
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('two provider 503 responses degrade shopping chat to safe catalogue search',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-secret';
 let attempts=0;
 try{
  const result=await shoppingAssistant('tea',seedProducts,async()=>{attempts++;return new Response('{}',{status:503});});
  assert.equal(attempts,2);
  assert.equal(result.mode,'catalogue-fallback');
  assert.match(result.reply,/AI is temporarily unavailable/);
  assert.deepEqual(result.cartActions,[]);
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('nonretryable 403 uses immediate catalogue fallback without repeated requests',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-secret';
 let attempts=0;
 try{
  const result=await shoppingAssistant('tea',seedProducts,async()=>{attempts++;return new Response('{}',{status:403});});
  assert.equal(attempts,1);
  assert.equal(result.mode,'catalogue-fallback');
  assert.deepEqual(result.cartActions,[]);
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
