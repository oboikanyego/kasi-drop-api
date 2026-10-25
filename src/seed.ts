import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {ProductModel,UserModel} from './models.js';
import {seedProducts} from './catalogue.js';
async function main(){if(!process.env.MONGODB_URI)throw Error('MONGODB_URI required');
 await mongoose.connect(process.env.MONGODB_URI, {dbName: process.env.MONGODB_DB_NAME || 'kasidrop'});
 for(const p of seedProducts) await ProductModel.updateOne({id:p.id},{$setOnInsert:p},{upsert:true});
 if(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD){
  const email=process.env.SEED_ADMIN_EMAIL.toLowerCase();
  if(!await UserModel.exists({email}))await UserModel.create({email,name:'KasiDrop Admin',passwordHash:await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD,12),role:'admin'});
 }
 console.log('Seed complete');await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
