import assert from 'node:assert/strict';
import test from 'node:test';
import {seedProducts,searchCatalogue,quote} from '../src/catalogue.js';
test('search finds local products and winter synonyms',()=>{assert.ok(searchCatalogue(seedProducts,'winter').some(p=>p.id==='beanie'));assert.ok(searchCatalogue(seedProducts,'braai').some(p=>p.id==='biltong-box'));});
test('quote computes ZAR totals on the server',()=>{const q=quote(seedProducts,[{productId:'rooibos-tea',quantity:2}]);assert.equal(q.subtotal,258);assert.equal(q.shipping,79);assert.equal(q.total,337);});
test('shipping is free above R750',()=>{const q=quote(seedProducts,[{productId:'kasi-hoodie',quantity:2}]);assert.equal(q.shipping,0);});
test('prevents over-selling',()=>{assert.throws(()=>quote(seedProducts,[{productId:'pottery-bowl',quantity:10}]),/Insufficient stock/);});
test('rejects duplicate line items',()=>{assert.throws(()=>quote(seedProducts,[{productId:'rooibos-tea',quantity:1},{productId:'rooibos-tea',quantity:1}]),/Duplicate/);});

test('fractional-price orders are totaled in exact cents',()=>{
 const products=seedProducts.map(p=>p.id==='rooibos-tea'?{...p,price:129.95}:p);
 const q=quote(products,[{productId:'rooibos-tea',quantity:3}]);
 assert.equal(q.subtotal,389.85);assert.equal(q.shipping,79);assert.equal(q.total,468.85);
});
test('invalid product prices are rejected by quote',()=>{
 const products=seedProducts.map(p=>p.id==='rooibos-tea'?{...p,price:129.999}:p);
 assert.throws(()=>quote(products,[{productId:'rooibos-tea',quantity:1}]),/Invalid monetary/);
});

test('retail demo catalogue has twelve distinct shop-style SKUs with valid fields',()=>{
 const mocked=seedProducts.filter(p=>p.id.startsWith('mock-'));
 assert.equal(mocked.length,12);
 assert.equal(new Set(seedProducts.map(p=>p.id)).size,seedProducts.length);
 for(const item of mocked){
  assert.equal(item.active,true);
  assert.ok(item.stock>0);
  assert.ok(item.price>0&&Number.isInteger(item.price*100));
  assert.ok(item.image.startsWith('https://images.unsplash.com/photo-'));
  assert.ok(item.description.includes('Mock')||item.description.includes('mock'));
  assert.ok(item.tags.length>=3);
 }
});
test('retail demo SKUs can be searched and quoted independently',()=>{
 const rooibos=seedProducts.find(p=>p.id==='mock-rooibos-40');
 assert.ok(rooibos);
 assert.ok(searchCatalogue(seedProducts,'rooibos').some(p=>p.id===rooibos.id));
 const q=quote(seedProducts,[{productId:rooibos.id,quantity:2}]);
 assert.equal(q.subtotal,99.98);
 assert.equal(q.total,178.98);
});
