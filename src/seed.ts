import 'dotenv/config';
import mongoose from 'mongoose';
import {connectMongo} from './db.js';
import {seedCatalogue,provisionAdminFromEnv} from './seeding.js';

async function main(){
 // The CLI ALWAYS seeds MongoDB, regardless of DEMO_MODE. It never writes to demo memory.
 await connectMongo();
 const summary=await seedCatalogue();
 await provisionAdminFromEnv();
 console.log('MongoDB seed finished: '+JSON.stringify(summary));
}
main().catch(e=>{console.error('MongoDB seeding failed:',e);process.exitCode=1;}).finally(async()=>{
 if(mongoose.connection.readyState!==0)await mongoose.disconnect();
});
