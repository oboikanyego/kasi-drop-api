import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {payfastUrlEncode,payfastSignature,verifyPayfastItn} from '../src/payfast-signature.js';

const md5=(s:string)=>createHash('md5').update(s).digest('hex');
test('PayFast PHP urlencode encodes punctuation, whitespace and uppercase hex',()=>{
 assert.equal(payfastUrlEncode(' Kasi Drop! (ZA) ~ '),'Kasi+Drop%21+%28ZA%29+%7E');
});
test('checkout signatures follow insertion order and PHP-style encoding',()=>{
 const fields={merchant_id:'10000100',item_name:'Kasi Drop!',amount:'120.00'};
 const expected=md5('merchant_id=10000100&item_name=Kasi+Drop%21&amount=120.00&passphrase=demo-pass');
 assert.equal(payfastSignature(fields,'demo-pass'),expected);
});
test('ITN signed fields end at signature and exclude later additions',()=>{
 const signed='m_payment_id=order1&payment_status=COMPLETE&item_name=Kasi+Drop%21&amount_gross=120.00';
 const sig=md5(signed+'&passphrase=demo-pass');
 assert.equal(verifyPayfastItn(signed+'&signature='+sig+'&appended_extra=ignored','demo-pass'),true);
});
test('tampered, reordered, or incorrectly salted ITN is rejected',()=>{
 const fields='m_payment_id=order1&amount_gross=120.00&payment_status=COMPLETE';
 const sig=md5(fields+'&passphrase=demo-pass');
 assert.equal(verifyPayfastItn(fields+'&signature='+sig,'demo-pass'),true);
 assert.equal(verifyPayfastItn(fields.replace('120.00','120.01')+'&signature='+sig,'demo-pass'),false);
 assert.equal(verifyPayfastItn('amount_gross=120.00&m_payment_id=order1&payment_status=COMPLETE&signature='+sig,'demo-pass'),false);
 assert.equal(verifyPayfastItn(fields+'&signature='+sig,'wrong'),false);
});
test('malformed or duplicate notification fields fail closed',()=>{
 assert.equal(verifyPayfastItn('payment_status=COMPLETE','demo-pass'),false);
 assert.equal(verifyPayfastItn('payment_status=COMPLETE&signature=zzz','demo-pass'),false);
 assert.equal(verifyPayfastItn('payment_status=COMPLETE&payment_status=FAILED&signature=00000000000000000000000000000000','demo-pass'),false);
});
