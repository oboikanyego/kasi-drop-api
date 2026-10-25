import type {Product} from './catalogue.js';
import {searchCatalogue} from './catalogue.js';

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
 const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model())+':generateContent',{
  method:'POST',
  headers:{'content-type':'application/json','x-goog-api-key':key},
  body:JSON.stringify({...body,generationConfig:{maxOutputTokens:800,...(body.generationConfig as Record<string,unknown>||{})}}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new GeminiError(response.status);
 return await response.json() as GeminiResponse;
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
export async function shoppingAssistant(message:string,products:Product[]){
 if(!geminiConfigured())return fallback(message,products);
 const active=products.filter(p=>p.active);
 const snapshot=active.slice(0,150).map(p=>({
  id:p.id,name:p.name,category:p.category,price:p.price,stock:p.stock,
  description:p.description.slice(0,110)
 }));
 const started=Date.now();
 // Single request instead of 2-4 sequential tool-use turns. The model receives
 // accurate stock/prices in its prompt; its suggestions are validated server-side.
 const resp=await generateGemini({
  systemInstruction:{parts:[{text:
   'You are the KasiDrop South African shopping assistant. Answer briefly in friendly English, using only the supplied catalogue. Never invent items, stock or pricing. Recommend available products and match budget/category filters. Return a JSON object: reply (string, max 500 characters), productIds (array of actual catalogue IDs, max 4), cartActions (array of {productId,quantity}). Only propose cartActions when the shopper explicitly asks to add or buy an item. Product IDs and stock must match supplied catalogue. No customer personal data. No markdown.'}]},
  contents:[{role:'user',parts:[{text:'CATALOGUE: '+JSON.stringify(snapshot)+'\nSHOPPER REQUEST: '+message}]}],
  generationConfig:{responseMimeType:'application/json',maxOutputTokens:650,
   ...(model().startsWith('gemini-3')?{thinkingConfig:{thinkingLevel:'minimal'}}:{})}
 });
 const text=resp.candidates?.[0]?.content?.parts?.filter(part=>typeof part.text==='string').map(part=>part.text).join('')||'';
 if(!text.trim())throw Error('Gemini returned an empty shopping response');
 const result=validatedShoppingResult(JSON.parse(text),active);
 console.info('[gemini] shopping chat complete',{durationMs:Date.now()-started,model:model(),catalogueSize:snapshot.length,results:result.products.length});
 return result;
}
export async function draftListing(notes:{name:string;notes:string;category:string}){
 if(!geminiConfigured())throw new Error('AI listing generator requires GEMINI_API_KEY');
 const resp=await generateGemini({
  systemInstruction:{parts:[{text:'Create a factual and concise South African e-commerce product listing. Never invent materials, origin, certifications or product claims not in the notes. Output JSON with keys title, description, tags (string array).'}]},
  contents:[{role:'user',parts:[{text:JSON.stringify(notes)}]}],
  generationConfig:{responseMimeType:'application/json',maxOutputTokens:800}
 });
 const raw=resp.candidates?.[0]?.content?.parts?.filter(p=>p.text).map(p=>p.text).join('')||'';
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object')throw Error('Invalid Gemini listing response');
 return {
  title:String(data.title||'').slice(0,120),
  description:String(data.description||'').slice(0,1000),
  tags:Array.isArray(data.tags)?data.tags.slice(0,10).map((x:unknown)=>String(x).slice(0,30)):[]
 };
}
