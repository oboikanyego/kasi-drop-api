import { searchTerms } from './catalogue.js';

/** Escape user input before using it in a MongoDB regular expression. */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const maxPageSize = 100;
export type CatalogueSort = 'featured' | 'price-asc' | 'price-desc';

/** MongoDB equivalent of searchCatalogue(): same active, category, price and term matching. */
export function catalogueFilter(query = '', category = 'All', maxPrice?: number) {
  const filter: Record<string, unknown> = { active: true };
  if (category && category !== 'All') filter.category = category;
  if (maxPrice) filter.price = { $lte: maxPrice };
  const terms = searchTerms(query);
  if (terms.length) {
    const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'i');
    filter.$or = ['name', 'description', 'category', 'tags'].map((field) => ({
      [field]: pattern,
    }));
  }
  return filter;
}

/** Sort order matching the in-memory sort; _id keeps ties in insertion order like the old stable sort. */
export function catalogueSort(sort: string): Record<string, 1 | -1> {
  if (sort === 'price-asc') return { price: 1, _id: 1 };
  if (sort === 'price-desc') return { price: -1, _id: 1 };
  return { featured: -1, _id: 1 };
}

/** Parse ?page and ?limit; out-of-range values fall back to safe defaults. */
export function pagination(page: unknown, limit: unknown) {
  const size = Math.floor(Number(limit));
  const index = Math.floor(Number(page));
  const pageSize = size >= 1 && size <= maxPageSize ? size : maxPageSize;
  const pageNumber = index >= 1 ? index : 1;
  return { pageSize, pageNumber, skip: (pageNumber - 1) * pageSize };
}
