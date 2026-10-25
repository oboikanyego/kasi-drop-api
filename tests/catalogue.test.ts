import assert from 'node:assert/strict';
import test from 'node:test';
import {seedProducts,searchCatalogue,quote} from '../src/catalogue.js';
test('search finds local products and winter synonyms',()=>{assert.ok(searchCatalogue(seedProducts,'winter').some(p=>p.id==='beanie'));assert.ok(searchCatalogue(seedProducts,'braai').some(p=>p.id==='biltong-box'));});
test('quote computes ZAR totals on the server',()=>{const q=quote(seedProducts,[{productId:'rooibos-tea',quantity:2}]);assert.equal(q.subtotal,258);assert.equal(q.shipping,79);assert.equal(q.total,337);});
test('shipping is free above R750',()=>{const q=quote(seedProducts,[{productId:'kasi-hoodie',quantity:2}]);assert.equal(q.shipping,0);});
test('prevents over-selling',()=>{assert.throws(()=>quote(seedProducts,[{productId:'pottery-bowl',quantity:10}]),/Insufficient stock/);});
test('rejects duplicate line items',()=>{assert.throws(()=>quote(seedProducts,[{productId:'rooibos-tea',quantity:1},{productId:'rooibos-tea',quantity:1}]),/Duplicate/);});
