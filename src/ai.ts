import {groqConfigured,groqJson} from './groq.js';
import type {Product} from './catalogue.js';
import {searchCatalogue} from './catalogue.js';
import {HttpError} from './http-error.js';

type Action={productId:string;quantity:number};
type Part={text?:string;functionCall?:{name:string;args?:Record<string,unknown>;id?:string};functionResponse?:{name:string;response:unknown;id?:string}};
type Content={role:'user'|'model';parts:Part[]};
type GeminiResponse={candidates?:Array<{content?:{parts?:Part[]}}>};
const model=()=>process.env.GEMINI_MODEL||'gemini-3.1-flash-lite';
export const geminiConfigured=()=>Boolean(process.env.GEMINI_API_KEY?.trim());

export class GeminiError extends Error {
 constructor(public status:number){
  super(status===429?'Gemini free-tier quota reached':status===401||status===403?'Gemini API key was rejected':status===404?'Gemini model not available for this API key: check GEMINI_MODEL':'Gemini provider unavailable');
 }
}
export async function generateGemini(body:Record<string,unknown>,fetcher:typeof fetch=fetch):Promise<GeminiResponse>{
 const key=process.env.GEMINI_API_KEY?.trim();
 if(!key)throw new GeminiError(503);
 const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model())+':generateContent';
 const payload=JSON.stringify({...body,generationConfig:{maxOutputTokens:800,...(body.generationConfig as Record<string,unknown>||{})}});
 // Retry only one transient provider failure; avoid amplifying Gemini overload.
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetcher(url,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
    body:payload,signal:AbortSignal.timeout(7000)
   });
   if(response.ok)return await response.json() as GeminiResponse;
   if(attempt===0&&[502,503,504].includes(response.status)){
    await new Promise(resolve=>setTimeout(resolve,350));
    continue;
   }
   throw new GeminiError(response.status);
  }catch(error){
   if(error instanceof GeminiError)throw error;
   if(attempt===0){
    await new Promise(resolve=>setTimeout(resolve,350));
    continue;
   }
   throw error;
  }
 }
 throw new GeminiError(503);
}
function fallback(message:string,products:Product[]){
 const found=searchCatalogue(products,message).slice(0,4);
 return {reply:found.length?'Here are a few local picks based on your request. You can add any of them to your cart.':'I could not find a direct match. Try a category or a price range.',products:found,cartActions:[] as Action[],mode:'catalogue-fallback'};
}
/** Safely map the model's suggestion onto real catalogue records. The model cannot create products or invent stock. */
export function validatedShoppingResult(data:unknown,products:Product[]){
 const input=data&&typeof data==='object'?data as Record<string,unknown>:{};
 const requested=Array.isArray(input.productIds)?input.productIds:[];
 const productIds=[...new Set(requested.filter((id):id is string=>typeof id==='string'))].slice(0,8);
 const matches=productIds.map(id=>products.find(p=>p.id===id&&p.active&&p.stock>0)).filter((p):p is Product=>Boolean(p));
 const requestedActions=Array.isArray(input.cartActions)?input.cartActions:[];
 const cartActions:Action[]=[];
 for(const raw of requestedActions.slice(0,8)){
  if(!raw||typeof raw!=='object')continue;
  const entry=raw as Record<string,unknown>;
  const p=products.find(p=>p.id===entry.productId&&p.active);
  const qty=entry.quantity;
  if(!p||typeof qty!=='number'||!Number.isInteger(qty)||qty<1)continue;
  const already=cartActions.filter(a=>a.productId===p.id).reduce((n,a)=>n+a.quantity,0);
  if(qty+already>Math.min(p.stock,20))continue;
  cartActions.push({productId:p.id,quantity:qty});
  if(!matches.some(m=>m.id===p.id))matches.push(p);
 }
 const reply=typeof input.reply==='string'&&input.reply.trim()?input.reply.trim().slice(0,1200):
  matches.length?'Here are some local options to consider.':'Tell me what type of product you would like to find.';
 return {reply,products:matches,cartActions,mode:'gemini'};
}
export async function shoppingAssistant(message:string,products:Product[],fetcher:typeof fetch=fetch){
 if(!geminiConfigured()&&!groqConfigured())return fallback(message,products);
 const active=products.filter(p=>p.active);
 const snapshot=active.slice(0,150).map(p=>({
  id:p.id,name:p.name,category:p.category,price:p.price,stock:p.stock,
  description:p.description.slice(0,110)
 }));
 const started=Date.now();
 // Single request instead of 2-4 sequential tool-use turns. The model receives
 // accurate stock/prices in its prompt; its suggestions are validated server-side.
 const instruction='You are KasiDrop shopping assistant. Use only these South African products, actual prices and stock. Reply JSON with reply (brief text), productIds (array of real product IDs), cartActions (array of {productId,quantity}). Only add cartActions when the shopper explicitly asks. Never invent products, prices or stock.';
 const prompt='CATALOGUE: '+JSON.stringify(snapshot)+'\\nSHOPPER REQUEST: '+message;
 let parsed:unknown;
 let provider='gemini';
 if(geminiConfigured()){
  try{
   const response=await generateGemini({
    systemInstruction:{parts:[{text:instruction}]},
    contents:[{role:'user',parts:[{text:prompt}]}],
    generationConfig:{responseMimeType:'application/json',maxOutputTokens:650,
     ...(model().startsWith('gemini-3')?{thinkingConfig:{thinkingLevel:'minimal'}}:{})}
   },fetcher);
   const raw=response.candidates?.[0]?.content?.parts?.filter(p=>typeof p.text==='string').map(p=>p.text).join('')||'';
   parsed=JSON.parse(raw);
  }catch(err){console.warn('[ai] Gemini unavailable',{status:err instanceof GeminiError?err.status:'invalid_or_network'});}
 }
 if(parsed===undefined&&groqConfigured()){
  try{parsed=await groqJson(instruction,prompt,fetcher);provider='groq';}
  catch(err){console.warn('[ai] Groq unavailable',{status:err instanceof Error&&'status' in err?(err as {status:number}).status:'invalid_or_network'});}
 }
 if(parsed===undefined){
  const result=fallback(message,active);
  return {...result,reply:'AI is temporarily unavailable. '+result.reply};
 }
 const result={...validatedShoppingResult(parsed,active),mode:provider};

 console.info('[ai] shopping chat complete',{durationMs:Date.now()-started,provider,catalogueSize:snapshot.length,results:result.products.length});
 return result;
}
export async function draftListing(notes:{name:string;notes:string;category:string},fetcher:typeof fetch=fetch){
 if(!geminiConfigured()&&!groqConfigured())throw new HttpError(503,'AI listing requires GEMINI_API_KEY or GROQ_API_KEY');
 const instruction='Write a concise factual South African product listing using only supplied facts. Return JSON with title, description, tags (string array). Do not invent claims.';
 let data:unknown;
 if(geminiConfigured()){
  try{
   const response=await generateGemini({
    systemInstruction:{parts:[{text:instruction}]},
    contents:[{role:'user',parts:[{text:JSON.stringify(notes)}]}],
    generationConfig:{responseMimeType:'application/json',maxOutputTokens:800}
   },fetcher);
   const raw=response.candidates?.[0]?.content?.parts?.filter(p=>p.text).map(p=>p.text).join('')||'';
   data=JSON.parse(raw);
  }catch(err){console.warn('[ai] Gemini listing unavailable',{status:err instanceof GeminiError?err.status:'invalid_or_network'});}
 }
 if(data===undefined&&groqConfigured())data=await groqJson(instruction,JSON.stringify(notes),fetcher);
 if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(503,'AI listing providers unavailable');
 const item=data as Record<string,unknown>;
 return {
  title:String(item.title||'').slice(0,120),
  description:String(item.description||'').slice(0,1000),
  tags:Array.isArray(item.tags)?item.tags.slice(0,10).map((x:unknown)=>String(x).slice(0,30)):[]
 };
}
