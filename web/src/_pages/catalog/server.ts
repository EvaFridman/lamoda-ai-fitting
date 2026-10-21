import 'server-only';

// Public API of the slice: other layers import only from here. Every export is server-only.
export { categoryProxy } from './api/category-proxy';
export { generateCatalogMetadata, generateCategoryMetadata } from './model/metadata';
export { previewImageAlt, previewImageContentType, previewImageSize } from './model/preview-image';
export { catalogRobots } from './model/robots';
export { catalogSitemap } from './model/sitemap';
export { CatalogPage, CategoryPage, type CategoryPageProps } from './ui/catalog-page';
export { PreviewImage } from './ui/preview-image';
