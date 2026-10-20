import 'server-only';

// Public API of the slice: other layers import only from here. Every export is server-only.
export { categoryProxy } from './api/category-proxy';
export { generateCatalogMetadata, generateCategoryMetadata } from './model/metadata';
export { CatalogPage, CategoryPage, type CategoryPageProps } from './ui/catalog-page';
