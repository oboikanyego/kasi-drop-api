import assert from 'node:assert/strict';
import test from 'node:test';
import {currentIdentity,type StoredUser} from '../src/auth.js';
const accounts=new Map<string,StoredUser>([['u1',{id:'u1',email:'thandi@example.com',name:'Thandi',role:'customer'}]]);
const load=async(id:string)=>accounts.get(id);
test('identity comes from the stored account, not the token claims',async()=>{
 const stale={sub:'u1',email:'old@example.com',name:'Old name',role:'admin'};
 assert.deepEqual(await currentIdentity(stale,load),{sub:'u1',email:'thandi@example.com',name:'Thandi',role:'customer'});
});
test('a deleted account is signed out',async()=>{
 assert.equal(await currentIdentity({sub:'deleted',role:'admin'},load),null);
});
test('tokens without a usable subject are rejected without a lookup',async()=>{
 let lookups=0;const counting=async(id:string)=>{lookups++;return accounts.get(id);};
 for(const claims of [null,'u1',{},{sub:''},{sub:42}])assert.equal(await currentIdentity(claims,counting),null);
 assert.equal(lookups,0);
});
