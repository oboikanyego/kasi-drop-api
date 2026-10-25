import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveMongoConfig} from '../src/mongo-config.js';
import {productSeedOperations} from '../src/seed-plan.js';
import {seedProducts} from '../src/catalogue.js';

test('persistent database requires both URI and database name',()=>{
 assert.throws(()=>resolveMongoConfig({MONGODB_DB_NAME:'kasidrop'}),/MONGODB_URI/);
 assert.throws(()=>resolveMongoConfig({MONGODB_URI:'mongodb://localhost:27017/'}),/MONGODB_DB_NAME/);
 const config=resolveMongoConfig({MONGODB_URI:'mongodb://localhost:27017/',MONGODB_DB_NAME:'kasidrop'});
 assert.equal(config.dbName,'kasidrop');
 assert.equal(config.uri,'mongodb://localhost:27017/');
});
test('MongoDB config rejects invalid names and URI',()=>{
 assert.throws(()=>resolveMongoConfig({MONGODB_URI:'https://example.com',MONGODB_DB_NAME:'kasidrop'}),/mongodb/);
 assert.throws(()=>resolveMongoConfig({MONGODB_URI:'mongodb://localhost:27017',MONGODB_DB_NAME:'other/database'}),/MONGODB_DB_NAME/);
});
test('every seeded catalogue item has a unique stable ID',()=>{
 const ids=seedProducts.map(p=>p.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.length>=12);
});
test('idempotent seed uses upsert on insert only, without altering existing products',()=>{
 const operations=productSeedOperations(seedProducts);
 assert.equal(operations.length,seedProducts.length);
 assert.ok(operations.every(op=>op.updateOne.upsert===true));
 assert.ok(operations.every(op=>Object.keys(op.updateOne.update).join(',')==='$setOnInsert'));
 assert.deepEqual(operations.map(op=>op.updateOne.filter.id),seedProducts.map(p=>p.id));
});
test('a duplicate seed ID fails fast before database writes',()=>{
 assert.throws(()=>productSeedOperations([seedProducts[0],seedProducts[0]]),/Duplicate demo product ID/);
});
