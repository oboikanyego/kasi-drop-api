import { escapeRegex } from './catalogue-query.js';
import type { Product } from './catalogue.js';
import { z } from 'zod';

export const inventoryParamsSchema = z.object({
  q: z.string().trim().max(120).default(''),
  visibility: z.enum(['all','active','hidden']).default('all'),
  category: z.string().max(80).default('all'),
  stock: z.enum(['all','out','low','available']).default('all'),
  featured: z.enum(['all','yes','no']).default('all'),
  sort: z.enum(['newest','name-asc','name-desc','price-asc','price-desc','stock-asc','stock-desc']).default('newest'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type InventoryParams = z.infer<typeof inventoryParamsSchema>;
export const inventoryLimit = 100;
export function inventoryFilter(input: InventoryParams): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.visibility !== 'all') filter.active = input.visibility === 'active';
  if (input.category !== 'all') filter.category = input.category;
  if (input.stock === 'out') filter.stock = 0;
  if (input.stock === 'low') filter.stock = { $gt: 0, $lte: 5 };
  if (input.stock === 'available') filter.stock = { $gt: 5 };
  if (input.featured !== 'all') filter.featured = input.featured === 'yes';
  if (input.q) {
    const matcher = new RegExp(escapeRegex(input.q), 'i');
    filter.$or = ['name', 'id', 'description', 'tags'].map(field => ({ [field]: matcher }));
  }
  return filter;
}
export function inventorySort(sort: InventoryParams['sort']): Record<string, 1|-1> {
  const fields: Record<string, [string, 1|-1]> = {
    'name-asc': ['name', 1], 'name-desc': ['name', -1],
    'price-asc': ['price', 1], 'price-desc': ['price', -1],
    'stock-asc': ['stock', 1], 'stock-desc': ['stock', -1],
  };
  const field = fields[sort];
  return field ? { [field[0]]: field[1], _id: -1 } : { _id: -1 };
}
export function filterDemoInventory(products: Product[], params: InventoryParams): Product[] {
  const q = params.q.toLowerCase();
  const matching = products.filter(p =>
    (params.visibility === 'all' || p.active === (params.visibility === 'active')) &&
    (params.category === 'all' || p.category === params.category) &&
    (params.stock === 'all' || (params.stock === 'out' && p.stock === 0) ||
      (params.stock === 'low' && p.stock > 0 && p.stock <= 5) ||
      (params.stock === 'available' && p.stock > 5)) &&
    (params.featured === 'all' || p.featured === (params.featured === 'yes')) &&
    (!q || [p.name, p.id, p.description, ...p.tags].some(x => x.toLowerCase().includes(q)))
  );
  const sorters: Record<string, (a: Product,b: Product)=>number> = {
    'name-asc': (a,b) => a.name.localeCompare(b.name),
    'name-desc': (a,b) => b.name.localeCompare(a.name),
    'price-asc': (a,b) => a.price-b.price,
    'price-desc': (a,b) => b.price-a.price,
    'stock-asc': (a,b) => a.stock-b.stock,
    'stock-desc': (a,b) => b.stock-a.stock,
  };
  return params.sort === 'newest' ? [...matching] : [...matching].sort(sorters[params.sort]);
}
