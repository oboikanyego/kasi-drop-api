import {inCents} from './order-rules.js';
import {HttpError} from './http-error.js';
export type Product = { id:string; name:string; description:string; category:string; price:number; stock:number; image:string; tags:string[]; featured:boolean; active:boolean };
export const categories = ['All','Food & Drink','Fashion','Home & Living','Crafts'];
const img = (id:string) => 'https://images.unsplash.com/'+id+'?auto=format&fit=crop&w=800&q=85';
export const seedProducts:Product[] = [
  {id:'biltong-box',name:'The Braai Biltong Box',description:'Traditional South African beef biltong with a perfectly spiced finish. A lekker gift for every braai lover.',category:'Food & Drink',price:189,stock:25,image:img('photo-1546833999-b9f581a1996d'),tags:['biltong','braai','gift','snack'],featured:true,active:true},
  {id:'rooibos-tea',name:'Cape Rooibos Tea Collection',description:'Naturally caffeine-free rooibos tea sourced from the Western Cape. A comforting local classic.',category:'Food & Drink',price:129,stock:55,image:img('photo-1544787219-7f47ccb76574'),tags:['tea','rooibos','winter','gift'],featured:true,active:true},
  {id:'shweshwe-tote',name:'Shweshwe Everyday Tote',description:'Colourful patterned fabric tote inspired by South African textile traditions. Light, practical, and locally made.',category:'Fashion',price:249,stock:17,image:img('photo-1547949003-9792a18a2601'),tags:['bag','shweshwe','gift','fashion'],featured:true,active:true},
  {id:'kasi-hoodie',name:'Kasi Culture Hoodie',description:'Cosy unisex streetwear hoodie for crisp mornings and cooler evenings.',category:'Fashion',price:499,stock:14,image:img('photo-1556821840-3a63f95609a7'),tags:['hoodie','warm','winter','streetwear'],featured:true,active:true},
  {id:'beaded-bracelet',name:'Hand-Beaded Heritage Bracelet',description:'Handcrafted colourful beadwork celebrating local creativity. Every piece has its own personality.',category:'Crafts',price:99,stock:38,image:img('photo-1611652022419-a9419f74343d'),tags:['beads','handmade','gift','jewellery'],featured:false,active:true},
  {id:'woven-basket',name:'Artisan Woven Basket',description:'A beautiful handwoven basket for storage, gifting and everyday home styling.',category:'Home & Living',price:329,stock:10,image:img('photo-1494438639946-1ebd1d20bf85'),tags:['basket','decor','home','craft'],featured:true,active:true},
  {id:'chilli-sauce',name:'Mzansi Fire Chilli Sauce',description:'A small-batch hot sauce bringing bold local flavour to the table.',category:'Food & Drink',price:89,stock:64,image:img('photo-1472396961693-142e6e269027'),tags:['chilli','braai','sauce','food'],featured:false,active:true},
  {id:'beanie',name:'Winter Warm Knit Beanie',description:'Soft everyday knit beanie to keep the winter chill away.',category:'Fashion',price:159,stock:31,image:img('photo-1521369909029-2afed882baee'),tags:['beanie','winter','warm','gift'],featured:false,active:true},
  {id:'ceramic-mug',name:'Handcrafted Ceramic Mug',description:'An earthy handmade mug for morning coffee and rooibos rituals.',category:'Home & Living',price:199,stock:22,image:img('photo-1514228742587-6b1558fcca3d'),tags:['mug','coffee','tea','gift'],featured:false,active:true},
  {id:'leather-wallet',name:'Classic Leather Card Holder',description:'Minimal genuine leather card holder, locally crafted for everyday use.',category:'Fashion',price:289,stock:15,image:img('photo-1627123424574-724758594e93'),tags:['wallet','leather','gift'],featured:false,active:true},
  {id:'candle',name:'African Sunrise Soy Candle',description:'Hand-poured soy candle with warm citrus and wood notes.',category:'Home & Living',price:219,stock:24,image:img('photo-1603006905003-be475563bc59'),tags:['candle','home','gift','scent'],featured:false,active:true},
  {id:'pottery-bowl',name:'Earth-Tone Serving Bowl',description:'Artisan ceramic bowl that brings warmth to the dinner table.',category:'Crafts',price:379,stock:8,image:img('photo-1578749556568-bc2c40e68b61'),tags:['pottery','bowl','kitchen','craft'],featured:false,active:true},
  // Representative retail items: independent demo SKUs, not live merchant listings.
  {id:'mock-rooibos-40',name:"Rooibos Tea Bags — 40 Pack",description:"Caffeine-free rooibos, 40 tea bags. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Food & Drink",price:49.99,stock:42,image:img('photo-1544787219-7f47ccb76574'),tags:["rooibos","tea","grocery"],featured:true,active:true},
  {id:'mock-beef-biltong-100g',name:"Traditional Beef Biltong — 100 g",description:"Sliced spiced biltong, 100 g. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Food & Drink",price:89.95,stock:28,image:img('photo-1546833999-b9f581a1996d'),tags:["biltong","beef","braai"],featured:true,active:true},
  {id:'mock-stoneware-mug-350',name:"Stoneware Coffee Mug — 350 ml",description:"Glazed everyday coffee and tea mug. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Home & Living",price:119,stock:32,image:img('photo-1514228742587-6b1558fcca3d'),tags:["mug","ceramic","tea"],featured:true,active:true},
  {id:'mock-knit-beanie',name:"Rib-Knit Winter Beanie",description:"Unisex rib-knit winter beanie. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Fashion",price:99,stock:44,image:img('photo-1521369909029-2afed882baee'),tags:["beanie","knit","winter"],featured:false,active:true},
  {id:'mock-pullover-hoodie',name:"Everyday Unisex Pullover Hoodie",description:"Warm regular-fit pullover hoodie. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Fashion",price:349,stock:20,image:img('photo-1556821840-3a63f95609a7'),tags:["hoodie","streetwear","winter"],featured:false,active:true},
  {id:'mock-reusable-tote',name:"Reusable Everyday Tote Bag",description:"Everyday carry bag for shopping and errands. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Fashion",price:129,stock:37,image:img('photo-1547949003-9792a18a2601'),tags:["tote","bag","reusable"],featured:false,active:true},
  {id:'mock-slim-card-wallet',name:"Slim Leather Card Wallet",description:"Minimal card wallet with compact profile. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Fashion",price:179,stock:29,image:img('photo-1627123424574-724758594e93'),tags:["wallet","leather","cards"],featured:false,active:true},
  {id:'mock-scented-candle-200g',name:"Scented Jar Candle — 200 g",description:"Decorative scented candle in a jar. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Home & Living",price:159,stock:22,image:img('photo-1603006905003-be475563bc59'),tags:["candle","scented","gift"],featured:false,active:true},
  {id:'mock-serving-bowl-medium',name:"Ceramic Serving Bowl — Medium",description:"Ceramic serving bowl for everyday dining. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Home & Living",price:249,stock:18,image:img('photo-1578749556568-bc2c40e68b61'),tags:["ceramic","bowl","kitchen"],featured:false,active:true},
  {id:'mock-woven-storage-basket',name:"Woven Storage Basket — Medium",description:"Woven basket for shelf storage and decor. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Home & Living",price:229,stock:15,image:img('photo-1494438639946-1ebd1d20bf85'),tags:["woven","basket","storage"],featured:false,active:true},
  {id:'mock-beaded-bracelet',name:"Colourful Beaded Bracelet",description:"Beadwork-inspired fashion accessory. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Crafts",price:79,stock:49,image:img('photo-1611652022419-a9419f74343d'),tags:["bracelet","beadwork","craft"],featured:false,active:true},
  {id:'mock-rooibos-gift-tea',name:"Rooibos Gift Tea Selection",description:"Gift-sized selection of rooibos tea. Mock storefront listing with indicative price and stock; image is representative, not exact packaging.",category:"Food & Drink",price:139,stock:24,image:img('photo-1544787219-7f47ccb76574'),tags:["tea","rooibos","gift"],featured:false,active:true}
];
const expansions:Record<string,string[]> = {braai:['biltong','chilli','sauce'],cold:['winter','beanie','hoodie','warm'],warm:['winter','beanie','hoodie'],cosy:['winter','beanie','hoodie','candle','tea'],gift:['gift','handmade','bracelet','mug'],drink:['tea','rooibos','mug'],local:['handmade','craft','shweshwe']};
export function searchCatalogue(products:Product[], query='', category='All', maxPrice?:number) {
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const terms=words.flatMap(w=>[w,...(expansions[w]||[])]);
 return products.filter(p=>p.active && (category==='All'||!category||p.category===category) && (!maxPrice||p.price<=maxPrice) && (!terms.length||terms.some(t=>([p.name,p.description,p.category,...p.tags].join(' ').toLowerCase()).includes(t))));
}
export function quote(products:Product[], items:{productId:string;quantity:number}[]){
 if(!Array.isArray(items)||!items.length||items.length>30) throw new HttpError(400,'Cart must have 1–30 products');
 const seen=new Set<string>(); let subtotalCents=0;const lines=[];
 for(const item of items){
  if(seen.has(item.productId))throw new HttpError(400,'Duplicate product in cart');
  seen.add(item.productId);
  const p=products.find(p=>p.id===item.productId && p.active);
  if(!p)throw new HttpError(400,'Product not found: '+item.productId);
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)throw new HttpError(400,'Invalid quantity');
  if(p.stock<item.quantity)throw new HttpError(409,'Insufficient stock for '+p.name);
  subtotalCents+=inCents(p.price)*item.quantity;
  lines.push({productId:p.id,name:p.name,price:p.price,quantity:item.quantity,image:p.image});
 }
 const shippingCents=subtotalCents>=75000?0:7900;
 return {lines,subtotal:subtotalCents/100,shipping:shippingCents/100,total:(subtotalCents+shippingCents)/100};
}
