import { seedProducts, type Product } from './catalogue.js';

export const legacySeedProducts = seedProducts.filter((p) => !p.id.startsWith('mock-'));
export const retailSeedProducts = seedProducts.filter((p) => p.id.startsWith('mock-'));
export type RefreshAction = { id: string; reason: string; operation: 'retire' | 'skip' };
/** Conservative: never change products that differ from their original shipped seed. */
export function isUntouchedLegacy(current: Product, original: Product) {
  const keys = [
    'id',
    'name',
    'description',
    'category',
    'price',
    'stock',
    'image',
    'featured',
    'active',
  ] as const;
  return (
    keys.every((k) => current[k] === original[k]) &&
    JSON.stringify(current.tags) === JSON.stringify(original.tags)
  );
}
export function planDemoCatalogueRefresh(
  existing: readonly Product[],
  pendingOrderProductIds: ReadonlySet<string>,
): RefreshAction[] {
  return legacySeedProducts.map((original) => {
    const current = existing.find((p) => p.id === original.id);
    if (!current) return { id: original.id, operation: 'skip', reason: 'legacy product absent' };
    if (!current.active) return { id: original.id, operation: 'skip', reason: 'already inactive' };
    if (!isUntouchedLegacy(current, original))
      return {
        id: original.id,
        operation: 'skip',
        reason: 'product modified or stock changed; protect merchant data',
      };
    if (pendingOrderProductIds.has(original.id))
      return { id: original.id, operation: 'skip', reason: 'referenced by an unsettled order' };
    return { id: original.id, operation: 'retire', reason: 'unchanged legacy demo listing' };
  });
}
