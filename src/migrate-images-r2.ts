import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from './db.js';
import { ImageModel } from './models.js';
import { r2Config, r2Exists, r2Write } from './r2-store.js';

/**
 * Dry-run by default. Copies existing Mongo-stored images into R2 without deleting source data.
 * R2 is preferred for reads, and historical Mongo images remain as safe fallback.
 * Explicit opt-in: CONFIRM_R2_IMAGE_MIGRATION=YES npm run migrate:images:r2
 */
async function main() {
  if (!r2Config()) throw Error('Configure all R2 environment variables before migrating.');
  const apply = process.env.CONFIRM_R2_IMAGE_MIGRATION === 'YES';
  await connectMongo();
  let scanned = 0, copied = 0, alreadyStored = 0;
  for await (const image of ImageModel.find().cursor()) {
    scanned++;
    if (!apply) continue; // No R2 network calls or writes during a dry run.
    if (await r2Exists(image.id)) { alreadyStored++; continue; }
    await r2Write(image.id, image.data, image.mime);
    copied++;
  }
  console.log(JSON.stringify({ dryRun: !apply, scanned, copied, alreadyStored, sourceRecordsPreserved: true }));
}
main().catch(err => { console.error('R2 migration failed:', err instanceof Error ? err.message : 'unknown'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
