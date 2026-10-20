// app/ holds routing only: each route re-exports its page from the _pages layer (src/_pages).
export {
  CatalogPage as default,
  generateCatalogMetadata as generateMetadata,
} from '@/_pages/catalog/server';
