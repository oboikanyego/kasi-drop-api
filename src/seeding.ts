import bcrypt from 'bcryptjs';
import { seedProducts } from './catalogue.js';
import { ProductModel, UserModel } from './models.js';
import { productSeedOperations } from './seed-plan.js';

export type CatalogueSeedSummary = {
  templateProducts: number;
  created: number;
  preserved: number;
  activeProducts: number;
};

/** Idempotent bootstrap seed: never change or delete a previously created product.
 * Makes the same curated catalogue available in MongoDB that is shown in demo mode.
 */
export async function seedCatalogue(): Promise<CatalogueSeedSummary> {
  await ProductModel.init();
  const operations = productSeedOperations(seedProducts);
  const result = await ProductModel.bulkWrite(operations, { ordered: true });
  const created = result.upsertedCount;
  const summary = {
    templateProducts: seedProducts.length,
    created,
    preserved: seedProducts.length - created,
    activeProducts: await ProductModel.countDocuments({ active: true }),
  };
  console.log('KasiDrop catalogue seed: ' + JSON.stringify(summary));
  return summary;
}

/** Optional one-time admin; never overwrite existing credentials or elevate existing users.
 * Only invoked by the CLI, not the app's public startup.
 */
export async function provisionAdminFromEnv() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email && !password) return false;
  if (!email || !password) throw Error('Provide both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Invalid SEED_ADMIN_EMAIL');
  if (password.length < 12) throw Error('SEED_ADMIN_PASSWORD must contain at least 12 characters');
  await UserModel.init();
  await UserModel.updateOne(
    { email },
    {
      $setOnInsert: {
        email,
        name: 'KasiDrop Admin',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'admin',
      },
    },
    { upsert: true },
  );
  console.log('KasiDrop admin provisioning checked (existing accounts unchanged)');
  return true;
}
