import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from './db.js';
import { ProductModel, OrderModel } from './models.js';
import { seedCatalogue } from './seeding.js';
import {
  legacySeedProducts,
  retailSeedProducts,
  planDemoCatalogueRefresh,
} from './demo-catalogue-refresh.js';
import type { Product } from './catalogue.js';

async function main() {
  const apply = process.argv.includes('--apply');
  if (process.env.DEMO_MODE === 'true')
    throw Error('This operation requires database mode (DEMO_MODE=false)');
  if (apply && process.env.CONFIRM_DEMO_CATALOGUE_REFRESH !== 'YES')
    throw Error('For apply, set CONFIRM_DEMO_CATALOGUE_REFRESH=YES and pass --apply');
  await connectMongo();
  const ids = legacySeedProducts.map((p) => p.id);
  const existing = (await ProductModel.find({ id: { $in: ids } }).lean()) as unknown as Product[];
  const unsettled = (await OrderModel.find(
    {
      status: { $in: ['pending_payment', 'requires_review', 'processing'] },
      'items.productId': { $in: ids },
    },
    { 'items.productId': 1 },
  ).lean()) as Array<{ items: { productId: string }[] }>;
  const blocked = new Set(unsettled.flatMap((o) => o.items.map((l) => l.productId)));
  const actions = planDemoCatalogueRefresh(existing, blocked);
  const existingRetail = await ProductModel.find(
    { id: { $in: retailSeedProducts.map((p) => p.id) } },
    { id: 1 },
  ).lean();
  const missing = retailSeedProducts
    .filter((p) => !existingRetail.some((x) => x.id === p.id))
    .map((p) => p.id);
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'APPLY' : 'DRY_RUN',
        retailTemplates: retailSeedProducts.length,
        missingRetail: missing,
        retiredCandidates: actions.filter((a) => a.operation === 'retire'),
        protected: actions.filter((a) => a.operation === 'skip'),
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  // Insert only missing retail entries, no overwrite of existing products.
  await seedCatalogue();
  let retired = 0;
  for (const action of actions.filter((a) => a.operation === 'retire')) {
    const original = legacySeedProducts.find((p) => p.id === action.id)!;
    // Exact compare-and-set prevents clobbering changes since the dry-run snapshot.
    const result = await ProductModel.updateOne(
      {
        id: original.id,
        name: original.name,
        description: original.description,
        category: original.category,
        price: original.price,
        stock: original.stock,
        image: original.image,
        tags: original.tags,
        featured: original.featured,
        active: true,
      },
      { $set: { active: false } },
    );
    retired += result.modifiedCount;
  }
  console.log(
    JSON.stringify({
      applied: true,
      retired,
      retailTotal: retailSeedProducts.length,
      remainingVisibleLegacy: await ProductModel.countDocuments({ id: { $in: ids }, active: true }),
    }),
  );
}
main()
  .catch((e) => {
    console.error('Demo catalogue refresh failed:', e instanceof Error ? e.message : 'unknown');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
