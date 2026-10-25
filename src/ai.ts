import type {Product} from './catalogue.js';
import {searchCatalogue} from './catalogue.js';
type Action={productId:string;quantity:number};
const aiKey=()=>process.env.ANTHROPIC_API_KEY;
async function claude(body:unknown){
 const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':aiKey()||'','anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5',max_tokens:550,...(body as Record<string,unknown>)})});
 if(!response.ok)throw Error('AI provider unavailable ('+response.status+')');
 return await response.json() as any;
}
export async function shoppingAssistant(message:string,products:Product[]){
 if(!aiKey()){
  const found=searchCatalogue(products,message).slice(0,4);
  return {reply:found.length?'Here are a few local picks based on your request. You can add any of them to your cart.':'I could not find a direct match. Try a category or a price range.',products:found,cartActions:[],mode:'catalogue-fallback'};
 }
 const tools=[
  {name:'search_products',description:'Search real products. Include query, category or maxPrice.',input_schema:{type:'object',properties:{query:{type:'string'},category:{type:'string'},maxPrice:{type:'number'}}}},
  {name:'check_stock',description:'Check actual stock by productId.',input_schema:{type:'object',properties:{productId:{type:'string'}},required:['productId']}},
  {name:'add_to_cart',description:'Prepare a validated cart action for the client. Only use an actual product ID and positive quantity.',input_schema:{type:'object',properties:{productId:{type:'string'},quantity:{type:'integer'}},required:['productId','quantity']}}
 ];
 const actions:Action[]=[];const mentioned=new Set<string>();
 const messages:any[]=[{role:'user',content:message}];
 for(let round=0;round<4;round++){
  const resp=await claude({system:'You are KasiDrop shopping assistant for a South African store. Never invent products, prices, stock or order statuses. Use tools to search products and check stock before recommendations. If user wants to add something to cart, use add_to_cart. Respond briefly in friendly South African English. No markdown tables.',messages,tools});
  const blocks=resp.content||[];messages.push({role:'assistant',content:blocks});
  const calls=blocks.filter((b:any)=>b.type==='tool_use');
  if(!calls.length){return {reply:blocks.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join(' ').slice(0,1200),products:products.filter(p=>mentioned.has(p.id)),cartActions:actions,mode:'claude'};}
  const results=calls.map((call:any)=>{
   const input=call.input||{};let result:unknown;
   if(call.name==='search_products'){const found=searchCatalogue(products,String(input.query||''),String(input.category||'All'),Number(input.maxPrice)||undefined).slice(0,8);found.forEach(p=>mentioned.add(p.id));result=found.map(p=>({id:p.id,name:p.name,price:p.price,stock:p.stock,description:p.description}));}
   else if(call.name==='check_stock'){const p=products.find(p=>p.id===input.productId&&p.active);result=p?{id:p.id,stock:p.stock,price:p.price}: {error:'Not found'};}
   else if(call.name==='add_to_cart'){const p=products.find(p=>p.id===input.productId&&p.active);const qty=Number(input.quantity);if(p&&Number.isInteger(qty)&&qty>0&&qty<=Math.min(p.stock,20)){actions.push({productId:p.id,quantity:qty});mentioned.add(p.id);result={success:true,productId:p.id,quantity:qty};}else result={error:'Invalid product, quantity or unavailable stock'};}
   else result={error:'Unknown tool'};
   return {type:'tool_result',tool_use_id:call.id,content:JSON.stringify(result)};
  });
  messages.push({role:'user',content:results});
 }
 return {reply:'Here are the products I found for you.',products:products.filter(p=>mentioned.has(p.id)),cartActions:actions,mode:'claude'};
}
export async function draftListing(notes:{name:string;notes:string;category:string}){
 if(!aiKey())throw Error('AI listing generator requires ANTHROPIC_API_KEY');
 const resp=await claude({system:'Create a factual concise South African e-commerce listing. Never invent materials, origin, certifications or claims not supplied. Return valid JSON ONLY with keys title,description,tags (string array).',messages:[{role:'user',content:JSON.stringify(notes)}]});
 const raw=String(resp.content?.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('')||'').replace(/^\s*\x60\x60\x60(?:json)?|\x60\x60\x60\s*$/g,'').trim();
 const data=JSON.parse(raw);
 return {title:String(data.title||'').slice(0,120),description:String(data.description||'').slice(0,1000),tags:Array.isArray(data.tags)?data.tags.slice(0,10).map((x:unknown)=>String(x).slice(0,30)):[]};
}
