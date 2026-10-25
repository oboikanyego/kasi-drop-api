import assert from 'node:assert/strict';
import test from 'node:test';
import {canAdvanceOrder,validatePrice,inCents} from '../src/order-rules.js';
test('fulfilment proceeds in sequence',()=>{
 assert.equal(canAdvanceOrder('paid','processing'),true);
 assert.equal(canAdvanceOrder('demo_paid','processing'),true);
 assert.equal(canAdvanceOrder('processing','shipped'),true);
 assert.equal(canAdvanceOrder('shipped','delivered'),true);
});
test('prevents early dispatch, repeated transitions and cancel without refund',()=>{
 for(const [from,to] of [['pending_payment','shipped'],['paid','delivered'],['processing','delivered'],['shipped','processing'],['paid','cancelled'],['delivered','processing'],['paid','paid']])
  assert.equal(canAdvanceOrder(from,to),false,from+' → '+to);
});
test('ZAR prices require whole cents',()=>{
 assert.equal(validatePrice(99),true);assert.equal(validatePrice(99.95),true);
 assert.equal(validatePrice(0),false);assert.equal(validatePrice(99.999),false);
 assert.equal(validatePrice(Infinity),false);assert.equal(validatePrice(-3),false);
 assert.equal(inCents(99.95),9995);
});
