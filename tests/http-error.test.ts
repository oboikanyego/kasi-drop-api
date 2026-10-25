import assert from 'node:assert/strict';
import test from 'node:test';
import {HttpError,errorResponse} from '../src/http-error.js';
import {quote,seedProducts} from '../src/catalogue.js';
const statusOf=(fn:()=>unknown)=>{try{fn();}catch(err){return errorResponse(err);}throw Error('expected a throw');};
test('cart problems are client errors with their message',()=>{
 assert.deepEqual(statusOf(()=>quote(seedProducts,[{productId:'no-such-item',quantity:1}])),{status:400,body:{error:'Product not found: no-such-item'}});
 assert.equal(statusOf(()=>quote(seedProducts,[])).status,400);
 assert.equal(statusOf(()=>quote(seedProducts,[{productId:'rooibos-tea',quantity:0}])).status,400);
 assert.equal(statusOf(()=>quote(seedProducts,[{productId:'rooibos-tea',quantity:1},{productId:'rooibos-tea',quantity:1}])).status,400);
});
test('insufficient stock is a conflict',()=>{
 assert.deepEqual(statusOf(()=>quote(seedProducts,[{productId:'pottery-bowl',quantity:10}])),{status:409,body:{error:'Insufficient stock for Earth-Tone Serving Bowl'}});
});
test('unknown errors are 500 and never leak their message',()=>{
 assert.deepEqual(errorResponse(Error('Insufficient stock — internal detail')),{status:500,body:{error:'Request could not be completed'}});
 assert.deepEqual(errorResponse('boom'),{status:500,body:{error:'Request could not be completed'}});
 assert.deepEqual(errorResponse(new HttpError(503,'AI listing providers unavailable')),{status:503,body:{error:'AI listing providers unavailable'}});
});
