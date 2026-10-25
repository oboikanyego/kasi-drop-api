import 'dotenv/config';
import express, {type Request,type Response,type NextFunction} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {payfastSignature,verifyPayfastItn} from './payfast-signature.js';
import {z} from 'zod';
import {categories,seedProducts,searchCatalogue,quote,type Product} from './catalogue.js';
import {ProductModel,UserModel,OrderModel} from './models.js';
import {connectMongo} from './db.js';
import {seedCatalogue,type CatalogueSeedSummary} from './seeding.js';
import {seedDemoUsersAndOrders,type DemoSeedResult} from './demo-seeding.js';
import {shoppingAssistant,draftListing} from './ai.js';
import {registerProfileRoutes} from './profile-routes.js';

const app=express();app.disable('x-powered-by');
// Render terminates TLS at its trusted reverse proxy.
app.set('trust proxy',process.env.NODE_ENV==='production'?1:false);
const demo=process.env.DEMO_MODE==='true';
const secret=process.env.JWT_SECRET||(demo?randomUUID()+randomUUID():'');
if(!secret)throw Error('JWT_SECRET must be set in persistent mode');
const clientUrl=process.env.CLIENT_URL||'http://localhost:4200';
const allowed=clientUrl.split(',').map(s=>s.trim());
app.use(helmet());app.use(cors({origin:(origin,cb)=>cb(null,!origin||allowed.includes(origin))}));
const payfastItnRaw=new WeakMap<object,string>();
app.use(express.json({limit:'32kb'}));
app.use(express.urlencoded({extended:false,limit:'16kb',verify:(req,_res,body)=>{
 if(req.originalUrl.split('?')[0]==='/api/payfast/notify')payfastItnRaw.set(req,body.toString('utf8'));
}}));
// PayFast ITNs must not share shopper request throttling.
// Log only metadata/status; never log signatures or payment payloads.
app.use('/api/payfast/notify',(req,res,next)=>{
 const start=Date.now();
 res.on('finish',()=>console.info('[payfast:itn] request',{
  method:req.method,status:res.statusCode,contentType:req.headers['content-type']||'missing',
  durationMs:Date.now()-start
 }));
 next();
});
const shopperLimiter=rateLimit({windowMs:15*60*1000,limit:240,standardHeaders:'draft-7',legacyHeaders:false});
app.use('/api',(req,res,next)=>req.path==='/payfast/notify'?next():shopperLimiter(req,res,next));
const aiLimiter=rateLimit({windowMs:60*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false});
type Role='admin'|'customer';type User={id:string;name:string;email:string;passwordHash:string;role:Role};
type Order={id:string;userId:string;email:string;items:any[];subtotal:number;shipping:number;total:number;status:string;paymentMethod:string;demoSeed?:boolean;delivery:any;createdAt:Date;paidAt?:Date};
const memProducts=seedProducts.map(p=>({...p,tags:[...p.tags]}));
let seedStatus:CatalogueSeedSummary|undefined;
let demoSeedStatus:DemoSeedResult|undefined;
const memUsers:User[]=[];const memOrders:Order[]=[];
async function initialize(){
 if(demo){
  memUsers.push({id:'admin-demo',name:'Demo Admin',email:'admin@kasidrop.test',passwordHash:await bcrypt.hash('Demo@12345',10),role:'admin'});
  memUsers.push({id:'customer-demo',name:'Demo Shopper',email:'shopper@kasidrop.test',passwordHash:await bcrypt.hash('Demo@12345',10),role:'customer'});
  console.log('DEMO MODE: '+seedProducts.length+' temporary catalogue products, simulated checkout; no MongoDB writes.');
 }else{
  await connectMongo();
  // Idempotent: inserts missing catalogue products and preserves all existing edits.
  seedStatus=await seedCatalogue();
  // Demo fixtures are opt-in and use credentials supplied only in server env vars.
  demoSeedStatus=await seedDemoUsersAndOrders();
 }
}
async function products():Promise<Product[]>{
 return demo?memProducts:await ProductModel.find().lean() as unknown as Product[];
}
async function users(email:string):Promise<User|undefined>{
 if(demo)return memUsers.find(u=>u.email===email);
 const u=await UserModel.findOne({email}).lean();return u?{id:String(u._id),email:String(u.email),name:String(u.name),passwordHash:String(u.passwordHash),role:u.role as Role}:undefined;
}
function token(u:{id:string;email:string;name:string;role:Role}){return jwt.sign({sub:u.id,email:u.email,name:u.name,role:u.role},secret,{expiresIn:'7d'});}
function identity(req:Request):{sub:string;email:string;name:string;role:Role}|null{
 try{const v=(req.headers.authorization||'').replace(/^Bearer /i,'');return jwt.verify(v,secret) as any;}catch{return null;}
}
const guard=(role?:Role)=>(req:Request,res:Response,next:NextFunction)=>{
 const u=identity(req);if(!u)return res.status(401).json({error:'Sign in required'});
 if(role&&u.role!==role)return res.status(403).json({error:'Admin access required'});
 next();
};
const safe=(handler:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>Promise.resolve(handler(req,res)).catch(next);
const publicUser=(u:User)=>({id:u.id,name:u.name,email:u.email,role:u.role});
const registration=z.object({name:z.string().min(2).max(80),email:z.string().email().max(200).transform(s=>s.toLowerCase()),password:z.string().min(8).max(100)});
const loginSchema=z.object({email:z.string().email().transform(s=>s.toLowerCase()),password:z.string()});
const checkoutSchema=z.object({
 items:z.array(z.object({productId:z.string(),quantity:z.number().int().min(1).max(20)})).min(1).max(30),
 paymentMethod:z.enum(['demo','payfast']),
 delivery:z.object({name:z.string().min(2),phone:z.string().min(8),address:z.string().min(5),city:z.string().min(2),province:z.string().min(2),postalCode:z.string().min(3)})
});
const productSchema=z.object({name:z.string().min(3).max(100),description:z.string().min(10).max(1500),category:z.string().min(2),price:z.number().positive().max(100000),stock:z.number().int().min(0),image:z.string().url().max(500),tags:z.array(z.string().max(30)).max(10).default([]),featured:z.boolean().default(false),active:z.boolean().default(true)});
app.get('/health',(req,res)=>res.json({
 ok:true,app:'KasiDrop API',mode:demo?'demo':'database',
 catalogue:demo?{source:'memory',templateProducts:seedProducts.length,notPersisted:true}:
 {source:'mongodb',...seedStatus},
 ...(demo?{}:{demoData:demoSeedStatus}),
 timestamp:new Date().toISOString()
}));
app.get('/api/meta',(req,res)=>res.json({name:'KasiDrop',currency:'ZAR',categories,demoMode:demo,checkoutEnabled:demo||Boolean(process.env.PAYFAST_MERCHANT_ID&&process.env.PAYFAST_MERCHANT_KEY&&process.env.PAYFAST_PASSPHRASE&&process.env.PAYFAST_MODE==='sandbox'),aiEnabled:Boolean(process.env.ANTHROPIC_API_KEY)}));
app.get('/api/products',safe(async(req,res)=>{
 const all=await products(),category=String(req.query.category||'All'),search=String(req.query.q||''),maxPrice=Number(req.query.maxPrice)||undefined;
 const filtered=searchCatalogue(all,search,category,maxPrice);
 const sort=String(req.query.sort||'featured');filtered.sort(sort==='price-asc'?(a,b)=>a.price-b.price:sort==='price-desc'?(a,b)=>b.price-a.price:(a,b)=>Number(b.featured)-Number(a.featured));
 res.json({products:filtered,total:filtered.length});
}));
app.get('/api/products/:id',safe(async(req,res)=>{const p=(await products()).find(p=>p.id===req.params.id&&p.active);if(!p)return res.status(404).json({error:'Not found'});res.json({product:p,similar:searchCatalogue(await products(),p.tags[0]||p.category).filter(x=>x.id!==p.id).slice(0,4)});}));
app.post('/api/auth/register',rateLimit({windowMs:15*60*1000,limit:20}),safe(async(req,res)=>{
 const parsed=registration.parse(req.body);if(await users(parsed.email))return res.status(409).json({error:'Email is already registered'});
 const {password,...profile}=parsed;
 const u:User={id:randomUUID(),...profile,passwordHash:await bcrypt.hash(password,12),role:'customer'};
 if(demo)memUsers.push(u);else{const saved=await UserModel.create({email:u.email,name:u.name,passwordHash:u.passwordHash,role:u.role});u.id=String(saved._id);}
 res.status(201).json({user:publicUser(u),token:token(u)});
}));
app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:30}),safe(async(req,res)=>{
 const {email,password}=loginSchema.parse(req.body);const u=await users(email);
 if(!u||!await bcrypt.compare(password,u.passwordHash))return res.status(401).json({error:'Invalid email or password'});
 res.json({user:publicUser(u),token:token(u)});
}));
app.get('/api/auth/me',guard(),(req,res)=>{const u=identity(req)!;res.json({user:{id:u.sub,name:u.name,email:u.email,role:u.role}});});
async function getOrder(id:string):Promise<Order|undefined>{return demo?memOrders.find(o=>o.id===id):await OrderModel.findOne({id}).lean() as unknown as Order||undefined;}
async function updateOrder(id:string,changes:Partial<Order>){if(demo){const o=memOrders.find(o=>o.id===id);if(o)Object.assign(o,changes);}else await OrderModel.updateOne({id},{$set:changes});}
async function decrementStock(lines:Order['items']){
 if(demo){for(const l of lines){const p=memProducts.find(p=>p.id===l.productId);if(!p||p.stock<l.quantity)throw Error('Stock not available');}for(const l of lines)memProducts.find(p=>p.id===l.productId)!.stock-=l.quantity;return;}
 // MongoDB multi-document transaction requires Atlas replica set; roll back fully on errors.
 const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
  for(const l of lines){const result=await ProductModel.updateOne({id:l.productId,active:true,stock:{$gte:l.quantity}},{$inc:{stock:-l.quantity}},{session});if(result.modifiedCount!==1)throw Error('Insufficient stock for '+l.name);}
 });}finally{await session.endSession();}
}
function paymentBase(o:Order){
 const merchantId=process.env.PAYFAST_MERCHANT_ID,merchantKey=process.env.PAYFAST_MERCHANT_KEY;
 if(!merchantId||!merchantKey||!process.env.PAYFAST_PASSPHRASE)throw Error('PayFast sandbox is not configured');
 if(process.env.PAYFAST_MODE!=='sandbox')throw Error('Only PayFast sandbox is enabled in this release');
 const api=process.env.PUBLIC_API_URL||'http://localhost:10000';
 return {merchant_id:merchantId,merchant_key:merchantKey,return_url:clientUrl+'/orders?payment=return',cancel_url:clientUrl+'/orders?payment=cancel',notify_url:api+'/api/payfast/notify',m_payment_id:o.id,amount:o.total.toFixed(2),item_name:'KasiDrop order '+o.id.slice(0,8)};
}
function pfSignature(fields:Record<string,string>){
 return payfastSignature(fields,process.env.PAYFAST_PASSPHRASE||'');
}
app.post('/api/orders/checkout',guard(),safe(async(req,res)=>{
 const u=identity(req)!;const payload=checkoutSchema.parse(req.body);
 if(!demo&&payload.paymentMethod==='demo')return res.status(400).json({error:'Demo checkout is unavailable in persistent mode'});
 const pricing=quote(await products(),payload.items);
 const order:Order={id:randomUUID(),userId:u.sub,email:u.email,items:pricing.lines,...pricing,status:'pending_payment',paymentMethod:payload.paymentMethod,delivery:payload.delivery,createdAt:new Date()};
 if(payload.paymentMethod==='payfast'){
  if(!process.env.PAYFAST_MERCHANT_ID||!process.env.PAYFAST_MERCHANT_KEY||!process.env.PAYFAST_PASSPHRASE||process.env.PAYFAST_MODE!=='sandbox')return res.status(503).json({error:'PayFast sandbox is not configured'});
 }
 if(demo)memOrders.push(order);else await OrderModel.create(order);
 if(payload.paymentMethod==='demo'){
  try{await decrementStock(order.items);await updateOrder(order.id,{status:'demo_paid',paidAt:new Date()});order.status='demo_paid';}catch(e){await updateOrder(order.id,{status:'failed'});throw e;}
  return res.status(201).json({order,payment:null,warning:'Simulated payment only. No money was charged.'});
 }
 const data=paymentBase(order);const signature=pfSignature(data);
 res.status(201).json({order,payment:{url:'https://sandbox.payfast.co.za/eng/process',fields:{...data,signature}}});
}));
app.get('/api/orders',guard(),safe(async(req,res)=>{
 const u=identity(req)!;const orders=demo?memOrders.filter(o=>o.userId===u.sub):await OrderModel.find({userId:u.sub}).sort({createdAt:-1}).lean();
 res.json({orders:[...orders].sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())});
}));
app.get('/api/orders/:id',guard(),safe(async(req,res)=>{
 const u=identity(req)!;const order=await getOrder(req.params.id);if(!order||order.userId!==u.sub&&u.role!=='admin')return res.status(404).json({error:'Not found'});
 res.json({order});
}));
app.post('/api/payfast/notify',safe(async(req,res)=>{
 const reject=(reason:string,status=400)=>{
  console.warn('[payfast:itn] rejected',reason);
  return res.sendStatus(status);
 };
 if(process.env.PAYFAST_MODE!=='sandbox'||!process.env.PAYFAST_PASSPHRASE)return reject('sandbox_configuration',403);
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return reject('missing_or_unsupported_body');
 const fields:Record<string,string>=Object.fromEntries(Object.entries(req.body).map(([k,v])=>[k,String(v)]));
 if(!/^[a-f0-9]{32}$/i.test(fields.signature||''))return reject('missing_or_malformed_signature');
 const rawItn=payfastItnRaw.get(req);
 if(!rawItn)return reject('missing_raw_itn_body');
 if(!verifyPayfastItn(rawItn,process.env.PAYFAST_PASSPHRASE||''))return reject('signature_mismatch');
 const order=await getOrder(fields.m_payment_id||'');
 if(!order||order.demoSeed)return reject('order_not_found_or_test_fixture');
 if(fields.merchant_id!==process.env.PAYFAST_MERCHANT_ID)return reject('merchant_mismatch');
 if(!Number.isFinite(Number(fields.amount_gross))||Math.round(Number(fields.amount_gross)*100)!==Math.round(order.total*100))return reject('amount_mismatch');
 // Do not mark orders paid unless the transaction is independently confirmed.
 const validation=new URLSearchParams(fields);
 let remote:globalThis.Response;
 try{
  remote=await fetch('https://sandbox.payfast.co.za/eng/query/validate',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:validation.toString(),signal:AbortSignal.timeout(12000)
  });
 }catch(err){console.error('[payfast:itn] confirmation_unavailable',err instanceof Error?err.name:'network_error');return res.sendStatus(503);}
 if(!remote.ok)return reject('confirmation_http_'+remote.status);
 if((await remote.text()).trim()!=='VALID')return reject('confirmation_invalid');
 if(order.status!=='pending_payment')return res.sendStatus(200);
 if(fields.payment_status==='COMPLETE'){
  try{await decrementStock(order.items);await updateOrder(order.id,{status:'paid',paidAt:new Date()});}
  catch{await updateOrder(order.id,{status:'requires_review'});return reject('fulfilment_requires_review',500);}
 }else if(fields.payment_status==='FAILED'||fields.payment_status==='CANCELLED'){
  await updateOrder(order.id,{status:'failed'});
 }
 console.info('[payfast:itn] verified',{paymentStatus:fields.payment_status,orderUpdated:true});
 return res.sendStatus(200);
}));
app.get('/api/admin/summary',guard('admin'),safe(async(req,res)=>{
 const all=await products();const orders=demo?memOrders:await OrderModel.find().lean() as unknown as Order[];
 const revenueStatuses=['paid','processing','shipped','delivered'];
 const isSimulation=(o:Order)=>Boolean(o.demoSeed)||o.status==='demo_paid';
 res.json({
  products:all.length,lowStock:all.filter(p=>p.stock<=5).length,orders:orders.length,
  demoOrders:orders.filter(isSimulation).length,
  revenue:orders.filter(o=>!isSimulation(o)&&revenueStatuses.includes(o.status)).reduce((a,o)=>a+o.total,0),
  simulatedRevenue:orders.filter(o=>isSimulation(o)&&[...revenueStatuses,'demo_paid'].includes(o.status)).reduce((a,o)=>a+o.total,0),
  recentOrders:[...orders].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,10)
 });
}));
app.get('/api/admin/orders',guard('admin'),safe(async(req,res)=>{const orders=demo?memOrders:await OrderModel.find().sort({createdAt:-1}).lean();res.json({orders});}));
app.patch('/api/admin/orders/:id',guard('admin'),safe(async(req,res)=>{
 const status=z.enum(['processing','shipped','delivered','cancelled']).parse(req.body.status);const order=await getOrder(req.params.id);
 if(!order)return res.status(404).json({error:'Not found'});
 if(!['paid','demo_paid','processing','shipped'].includes(order.status))return res.status(409).json({error:'Order is not paid or fulfilment has not started'});
 if(status==='cancelled')return res.status(409).json({error:'Refund and cancellation must be handled through a verified payment workflow'});
 await updateOrder(order.id,{status});res.json({ok:true,status});
}));
app.post('/api/admin/products',guard('admin'),safe(async(req,res)=>{
 const input=productSchema.parse(req.body);const p={...input,id:randomUUID()};
 if(demo)memProducts.unshift(p);else await ProductModel.create(p);res.status(201).json({product:p});
}));
app.patch('/api/admin/products/:id',guard('admin'),safe(async(req,res)=>{
 const change=productSchema.partial().parse(req.body);
 if(demo){const p=memProducts.find(p=>p.id===req.params.id);if(!p)return res.sendStatus(404);Object.assign(p,change);return res.json({product:p});}
 const p=await ProductModel.findOneAndUpdate({id:req.params.id},{$set:change},{new:true}).lean();if(!p)return res.sendStatus(404);res.json({product:p});
}));
app.post('/api/ai/chat',aiLimiter,safe(async(req,res)=>{
 const message=z.string().min(2).max(400).parse(req.body.message);const result=await shoppingAssistant(message,await products());res.json(result);
}));
app.post('/api/admin/ai/listing',guard('admin'),aiLimiter,safe(async(req,res)=>{
 const info=z.object({name:z.string().min(2).max(100),notes:z.string().min(5).max(1000),category:z.string().max(60)}).parse(req.body);
 if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({error:'Set ANTHROPIC_API_KEY to enable AI listing generation'});
 res.json({draft:await draftListing(info)});
}));
registerProfileRoutes(app,guard(),identity,demo,id=>memUsers.find(user=>user.id===id));
app.use((err:unknown,req:Request,res:Response,next:NextFunction)=>{
 if(err instanceof z.ZodError)return res.status(400).json({error:'Validation failed',details:err.flatten()});
 console.error(err);return res.status(500).json({error:err instanceof Error&&['Insufficient stock','Cart must','Invalid quantity','Duplicate product'].some(t=>err.message.startsWith(t))?err.message:'Request could not be completed'});
});
const port=Number(process.env.PORT||10000);
initialize().then(()=>app.listen(port,'0.0.0.0',()=>console.log('KasiDrop API on :'+port))).catch(err=>{console.error('Failed to start',err);process.exit(1)});
