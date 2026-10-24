import 'server-only';

// Public API of the slice: other layers import only from here. Every export is server-only.
export { isProductPath, productProxy } from './api/product-proxy';
export { generateProductMetadata } from './model/metadata';
export { ProductPage, type ProductPageProps } from './ui/product-page';
