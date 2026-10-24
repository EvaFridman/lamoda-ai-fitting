import type { ProductDetail } from '@/entities/product';
import { Gallery, type GalleryImage } from '@/shared/ui';

import styles from './product-gallery.module.scss';

export interface ProductGalleryProps {
  product: Pick<ProductDetail, 'name' | 'brand' | 'images' | 'image'>;
  className?: string;
}

// The product's photos in their order (board 1), the first one named after the product; a product
// with none shows its cover, else an empty frame.
export function ProductGallery({ product, className }: ProductGalleryProps) {
  const name = `${product.brand.name} ${product.name}`;
  const sorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const images: GalleryImage[] = sorted.map((image, index) => ({
    id: image.id,
    src: image.url,
    alt: index === 0 ? name : '',
  }));
  if (images.length === 0 && product.image) {
    images.push({ id: 'cover', src: product.image.url, alt: name });
  }
  if (images.length === 0) {
    return <div className={[styles.empty, className].filter(Boolean).join(' ')} />;
  }
  return <Gallery images={images} aria-label="Фото товара" className={className} />;
}
