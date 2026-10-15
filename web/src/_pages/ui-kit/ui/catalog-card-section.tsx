import { CatalogProductCard, CatalogProductCardSkeleton } from '@/entities/product';
import { FavoriteToggle } from '@/shared/ui';

import { catalogProducts } from '../config/catalog';

import styles from './examples.module.scss';

// No product page exists yet (0009 K15): the cards lead to this section's own anchor.
const cardHref = '#catalog-card';

// The catalog card of entities/product in every case of the data, the favourite toggle in its
// action slot, and its skeleton. Cards are live: a click on one follows its link, a click on the
// heart does not.
export function CatalogCardSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Клик по карточке ведёт по её
        ссылке (здесь — к началу раздела), клик по сердечку переключает его и не открывает ссылку.
      </p>

      <h3 className={styles.heading}>CatalogProductCard</h3>
      <ul className={styles.cardGrid}>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.discounted}
            href={cardHref}
            action={<FavoriteToggle size={32} />}
          />
          <code className={styles.props}>discount: 20, action: FavoriteToggle</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard product={catalogProducts.fullPrice} href={cardHref} />
          <code className={styles.props}>discount: 0</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard product={catalogProducts.noPhoto} href={cardHref} />
          <code className={styles.props}>image: null</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard product={catalogProducts.noRating} href={cardHref} />
          <code className={styles.props}>rating: null</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard product={catalogProducts.longName} href={cardHref} />
          <code className={styles.props}>длинное название</code>
        </li>
      </ul>

      <h3 className={styles.heading}>CatalogProductCardSkeleton</h3>
      <ul className={styles.cardGrid}>
        <li className={styles.cardCell}>
          <CatalogProductCardSkeleton />
          <code className={styles.props}>пока карточка загружается</code>
        </li>
      </ul>
    </>
  );
}
