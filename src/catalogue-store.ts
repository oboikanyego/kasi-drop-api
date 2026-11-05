import { searchCatalogue, type Product } from './catalogue.js';
import { catalogueFilter, catalogueSort, pagination } from './catalogue-query.js';
import { ProductModel } from './models.js';
import { demo, memProducts } from './state.js';
import { popularProductIds } from './insights.js';

export const adminOrderLimit = 200;
// Catalogue reads are filtered, sorted and limited in MongoDB rather than loading every product.
type CatalogueQuery = { q: string; category: string; maxPrice?: number; sort: string };
export async function listProducts(query: CatalogueQuery, page: unknown, limit: unknown) {
  const { pageSize, pageNumber, skip } = pagination(page, limit);
  if (demo) {
    const filtered = searchCatalogue(memProducts, query.q, query.category, query.maxPrice);
    filtered.sort(
      query.sort === 'price-asc'
        ? (a, b) => a.price - b.price
        : query.sort === 'price-desc'
          ? (a, b) => b.price - a.price
          : (a, b) => Number(b.featured) - Number(a.featured),
    );
    return {
      products: filtered.slice(skip, skip + pageSize),
      total: filtered.length,
      pageNumber,
      pageSize,
    };
  }
  const filter = catalogueFilter(query.q, query.category, query.maxPrice);
  const [found, total] = await Promise.all([
    ProductModel.find(filter).sort(catalogueSort(query.sort)).skip(skip).limit(pageSize).lean(),
    ProductModel.countDocuments(filter),
  ]);
  return { products: found as unknown as Product[], total, pageNumber, pageSize };
}
export async function activeProduct(id: string): Promise<Product | undefined> {
  if (demo) return memProducts.find((p) => p.id === id && p.active);
  return (
    ((await ProductModel.findOne({ id, active: true }).lean()) as unknown as Product) || undefined
  );
}
export async function similarProducts(p: Product): Promise<Product[]> {
  const query = p.tags[0] || p.category;
  const found = demo
    ? searchCatalogue(memProducts, query)
    : ((await ProductModel.find(catalogueFilter(query))
        .sort({ _id: 1 })
        .limit(5)
        .lean()) as unknown as Product[]);
  return found.filter((x) => x.id !== p.id).slice(0, 4);
}
/** Products with these ids, active or not; callers apply their own active checks. */
export async function productsById(ids: string[]): Promise<Product[]> {
  if (demo) return memProducts.filter((p) => ids.includes(p.id));
  return (await ProductModel.find({ id: { $in: ids } }).lean()) as unknown as Product[];
}
/** Bounded active catalogue for the AI assistant, which only reads the first 150 products anyway. */
export async function assistantCatalogue(): Promise<Product[]> {
  const catalogue: Product[] = demo
    ? memProducts
    : ((await ProductModel.find({ active: true })
        .sort({ _id: 1 })
        .limit(150)
        .lean()) as unknown as Product[]);
  const popular = await popularProductIds(30).catch(() => [] as string[]);
  const positions = new Map(popular.map((id, i) => [id, i]));
  // Promote popular available products into the finite AI context; no shopper profiling.
  return [...catalogue].sort(
    (a, b) =>
      (positions.get(a.id) ?? 9999) - (positions.get(b.id) ?? 9999) ||
      Number(b.featured) - Number(a.featured),
  );
}
export async function trendingProducts(limit = 8): Promise<Product[]> {
  const products = await assistantCatalogue();
  return products.filter((p) => p.active && p.stock > 0).slice(0, limit);
}
