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
   assert.match(String(input),/gemini-2\.5-flash-lite:generateContent/);
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
