import test from 'node:test';
import assert from 'node:assert/strict';
import {groqJson} from '../src/groq.js';
test('Groq endpoint sends configured model and private bearer key',async()=>{
 const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test-only';
 try{
  const data=await groqJson('Return JSON','hello',async(url,init)=>{
   assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   assert.equal((init?.headers as Record<string,string>).authorization,'Bearer test-only');
   assert.equal(JSON.parse(String(init?.body)).model,process.env.GROQ_MODEL||'llama-3.3-70b-versatile');
   return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]}),{status:200});
  });
  assert.deepEqual(data,{ok:true});
 }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
