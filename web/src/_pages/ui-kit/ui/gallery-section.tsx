import { Gallery, type GalleryImage } from '@/shared/ui';

import styles from './examples.module.scss';

// The seed's photos, served at /media/ (nginx in production, `next dev`'s rewrite locally).
const photo = (article: string, n: number): GalleryImage => ({
  id: `${article}-${n}`,
  src: `/media/seed/products/${article}/${n}.webp`,
  alt: n === 1 ? 'Худи, спереди' : '',
});

const two = [photo('BRS-HD-001', 1), photo('BRS-HD-001', 2)];
const many = [
  photo('BRS-HD-001', 1),
  photo('BRS-HD-001', 2),
  photo('BRS-HD-001', 3),
  photo('BRS-JN-001', 1),
  photo('BRS-JN-001', 2),
  photo('BRS-JN-001', 3),
  photo('BRS-SH-001', 1),
];

// The product page's photos (board 1): two of them, and seven with «Показать ещё фото».
export function GallerySection() {
  return (
    <>
      <p className={styles.caption}>
        От 600px две большие фотографии рядом и до трёх маленьких под ними; «Показать ещё фото»
        открывает остальные. Уже 600px — по одной фотографии, листаются свайпом, под ними точки.
      </p>

      <h3 className={styles.heading}>Gallery</h3>
      <h4 className={styles.groupTitle}>Две фотографии</h4>
      <Gallery images={two} aria-label="Фото товара, пример 1" className={styles.gallery} />
      <h4 className={styles.groupTitle}>Семь фотографий</h4>
      <Gallery images={many} aria-label="Фото товара, пример 2" className={styles.gallery} />
    </>
  );
}
