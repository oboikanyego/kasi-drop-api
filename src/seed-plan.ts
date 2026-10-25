import type { Product } from './catalogue.js';
/** Inserts missing demo products without overwriting edited prices, images or stock. */
export function productSeedOperations(products: readonly Product[]) {
  const ids = new Set<string>();
  return products.map((product) => {
    if (ids.has(product.id)) throw Error('Duplicate demo product ID: ' + product.id);
    ids.add(product.id);
    return {
      updateOne: { filter: { id: product.id }, update: { $setOnInsert: product }, upsert: true },
    };
  });
}
