import type { ProductDetail } from '@/entities/product';

// The product page's address, its canonical one (spec 0019 plan §8, 0014 O7).
export function productPath(product: Pick<ProductDetail, 'id'>): string {
  return `/products/${encodeURIComponent(product.id)}`;
}
