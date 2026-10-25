import type {Product} from './catalogue.js';
import {searchCatalogue} from './catalogue.js';

type Action={productId:string;quantity:number};
type Part={text?:string;functionCall?:{name:string;args?:Record<string,unknown>;id?:string};functionResponse?:{name:string;response:unknown;id?:string}};
type Content={role:'user'|'model';parts:Part[]};
type GeminiResponse={candidates?:Array<{content?:{parts?:Part[]}}>};
const model=()=>process.env.GEMINI_MODEL||'gemini-2.5-flash-lite';
export const geminiConfigured=()=>Boolean(process.env.GEMINI_API_KEY?.trim());

export class GeminiError extends Error {
 constructor(public status:number){
  super(status===429?'Gemini free-tier quota reached':status===401||status===403?'Gemini API key was rejected':'Gemini provider unavailable');
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
const instructions='You are KasiDrop shopping assistant for a South African store. Never invent products, prices, stock or order statuses. Use functions to search actual products and check stock before recommendations. For add-to-cart requests, call add_to_cart. Be concise and friendly in South African English. No markdown tables.';
const declarations=[
 {name:'search_products',description:'Find actual products. query, category, maxPrice are optional.',parameters:{type:'OBJECT',properties:{query:{type:'STRING'},category:{type:'STRING'},maxPrice:{type:'NUMBER'}}}},
 {name:'check_stock',description:'Check actual stock by productId.',parameters:{type:'OBJECT',properties:{productId:{type:'STRING'}},required:['productId']}},
 {name:'add_to_cart',description:'Prepare a validated cart action using a real product ID and a positive quantity.',parameters:{type:'OBJECT',properties:{productId:{type:'STRING'},quantity:{type:'INTEGER'}},required:['productId','quantity']}}
];
function fallback(message:string,products:Product[]){
 const found=searchCatalogue(products,message).slice(0,4);
 return {reply:found.length?'Here are a few local picks based on your request. You can add any of them to your cart.':'I could not find a direct match. Try a category or a price range.',products:found,cartActions:[] as Action[],mode:'catalogue-fallback'};
}
export async function shoppingAssistant(message:string,products:Product[]){
 if(!geminiConfigured())return fallback(message,products);
 const conversation:Content[]=[{role:'user',parts:[{text:message}]}];
 const actions:Action[]=[];const mentioned=new Set<string>();
 for(let round=0;round<4;round++){
  const resp=await generateGemini({systemInstruction:{parts:[{text:instructions}]},contents:conversation,tools:[{functionDeclarations:declarations}]});
  const blocks=resp.candidates?.[0]?.content?.parts||[];
  if(!blocks.length)throw Error('Gemini returned an empty response');
  conversation.push({role:'model',parts:blocks});
  const calls=blocks.filter(b=>b.functionCall).map(b=>b.functionCall!);
  const reply=blocks.filter(b=>typeof b.text==='string').map(b=>b.text).join(' ').trim();
  if(!calls.length){
   return {reply:(reply||'Here are some options you might like.').slice(0,1200),products:products.filter(p=>mentioned.has(p.id)),cartActions:actions,mode:'gemini'};
  }
  const results:Part[]=[];
  for(const call of calls){
   const input=call.args||{};let result:unknown;
   if(call.name==='search_products'){
    const found=searchCatalogue(products,String(input.query||''),String(input.category||'All'),Number(input.maxPrice)||undefined).slice(0,8);
    found.forEach(p=>mentioned.add(p.id));
    result=found.map(p=>({id:p.id,name:p.name,price:p.price,stock:p.stock,description:p.description}));
   }else if(call.name==='check_stock'){
    const p=products.find(p=>p.id===input.productId&&p.active);
    result=p?{id:p.id,stock:p.stock,price:p.price}:{error:'Not found'};
   }else if(call.name==='add_to_cart'){
    const p=products.find(p=>p.id===input.productId&&p.active);
    const qty=Number(input.quantity);
    const already=actions.filter(a=>a.productId===p?.id).reduce((total,a)=>total+a.quantity,0);
    if(p&&Number.isInteger(qty)&&qty>0&&qty<=20&&qty+already<=p.stock){
     actions.push({productId:p.id,quantity:qty});mentioned.add(p.id);result={success:true,productId:p.id,quantity:qty};
    }else result={error:'Invalid product, quantity or unavailable stock'};
   }else result={error:'Unknown function'};
   results.push({functionResponse:{name:call.name,response:{result},...(call.id?{id:call.id}:{})}});
  }
  conversation.push({role:'user',parts:results});
 }
 return {reply:'Here are the products I found for you.',products:products.filter(p=>mentioned.has(p.id)),cartActions:actions,mode:'gemini'};
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
