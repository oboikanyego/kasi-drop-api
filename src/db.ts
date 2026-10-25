import mongoose from 'mongoose';
import {resolveMongoConfig} from './mongo-config.js';

export async function connectMongo(){
 const {uri,dbName}=resolveMongoConfig();
 await mongoose.connect(uri,{dbName,serverSelectionTimeoutMS:15_000});
 console.log('MongoDB connected to configured database '+dbName);
}
