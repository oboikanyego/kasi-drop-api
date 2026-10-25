/** Required MongoDB configuration for persistent KasiDrop mode.
 * The URI targets a MongoDB cluster. The selected database is always explicit.
 */
export function resolveMongoConfig(env: Record<string,string|undefined> = process.env) {
 const uri=env.MONGODB_URI?.trim();
 const dbName=env.MONGODB_DB_NAME?.trim();
 if(!uri)throw Error('MONGODB_URI is required for persistent mode');
 if(!dbName)throw Error('MONGODB_DB_NAME is required for persistent mode');
 if(!/^mongodb(\+srv)?:\/\//i.test(uri))throw Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
 if(!/^[\w-]+$/.test(dbName))throw Error('MONGODB_DB_NAME must contain only letters, numbers, underscores or hyphens');
 return {uri,dbName};
}
