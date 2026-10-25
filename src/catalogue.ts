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
  {id:'pottery-bowl',name:'Earth-Tone Serving Bowl',description:'Artisan ceramic bowl that brings warmth to the dinner table.',category:'Crafts',price:379,stock:8,image:img('photo-1578749556568-bc2c40e68b61'),tags:['pottery','bowl','kitchen','craft'],featured:false,active:true}
];
const expansions:Record<string,string[]> = {braai:['biltong','chilli','sauce'],cold:['winter','beanie','hoodie','warm'],warm:['winter','beanie','hoodie'],cosy:['winter','beanie','hoodie','candle','tea'],gift:['gift','handmade','bracelet','mug'],drink:['tea','rooibos','mug'],local:['handmade','craft','shweshwe']};
export function searchCatalogue(products:Product[], query='', category='All', maxPrice?:number) {
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const terms=words.flatMap(w=>[w,...(expansions[w]||[])]);
 return products.filter(p=>p.active && (category==='All'||!category||p.category===category) && (!maxPrice||p.price<=maxPrice) && (!terms.length||terms.some(t=>([p.name,p.description,p.category,...p.tags].join(' ').toLowerCase()).includes(t))));
}
export function quote(products:Product[], items:{productId:string;quantity:number}[]){
 if(!Array.isArray(items)||!items.length||items.length>30) throw Error('Cart must have 1–30 products');
 const seen=new Set<string>(); let subtotal=0;const lines=[];
 for(const item of items){
  if(seen.has(item.productId))throw Error('Duplicate product in cart');
  seen.add(item.productId);
  const p=products.find(p=>p.id===item.productId && p.active);
  if(!p)throw Error('Product not found: '+item.productId);
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)throw Error('Invalid quantity');
  if(p.stock<item.quantity)throw Error('Insufficient stock for '+p.name);
  subtotal+=p.price*item.quantity;
  lines.push({productId:p.id,name:p.name,price:p.price,quantity:item.quantity,image:p.image});
 }
 return {lines,subtotal,shipping:subtotal>=750?0:79,total:subtotal+(subtotal>=750?0:79)};
}
