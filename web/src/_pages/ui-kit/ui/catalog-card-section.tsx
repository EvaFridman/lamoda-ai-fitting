import { CatalogProductCard, CatalogProductCardSkeleton, LookToggle } from '@/entities/product';
import { Button, FavoriteToggle } from '@/shared/ui';

import { catalogProducts } from '../config/catalog';

import styles from './examples.module.scss';

// The cards lead to this section's own anchor.
const cardHref = '#catalog-card';

// The catalog card of entities/product in every case of the data, the hanger and the favourite
// toggle in its two corners (spec 0019 A63.1), its compact variant of «С этим товаром выбирают»
// with a button under it (A83.4), and its skeletons. Cards are live: a click on one follows its
// link, a click on a corner or the button does not.
export function CatalogCardSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Клик по карточке ведёт по её
        ссылке (здесь — к началу раздела), клик по вешалке, сердечку или кнопке не открывает ссылку.
      </p>

      <h3 className={styles.heading}>CatalogProductCard</h3>
      <ul className={styles.cardGrid}>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.discounted}
            href={cardHref}
            lookToggle={<LookToggle />}
            favorite={<FavoriteToggle size={32} />}
          />
          <code className={styles.props}>discount: 20, lookToggle, favorite</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.fullPrice}
            href={cardHref}
            lookToggle={<LookToggle pressed />}
            favorite={<FavoriteToggle size={32} defaultPressed />}
          />
          <code className={styles.props}>discount: 0, LookToggle pressed</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.noPhoto}
            href={cardHref}
            lookToggle={<LookToggle disabled />}
          />
          <code className={styles.props}>image: null, LookToggle disabled</code>
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

      <h3 className={styles.heading}>CatalogProductCard variant=&quot;compact&quot;</h3>
      <ul className={styles.cardGrid}>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.discounted}
            variant="compact"
            href={cardHref}
            lookToggle={<LookToggle />}
            favorite={<FavoriteToggle size={32} />}
            footer={
              <Button size={32} textSize="body-s">
                В корзину
              </Button>
            }
          />
          <code className={styles.props}>footer: Button 32</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCard
            product={catalogProducts.longName}
            variant="compact"
            href={cardHref}
          />
          <code className={styles.props}>длинное название</code>
        </li>
      </ul>

      <h3 className={styles.heading}>CatalogProductCardSkeleton</h3>
      <ul className={styles.cardGrid}>
        <li className={styles.cardCell}>
          <CatalogProductCardSkeleton />
          <code className={styles.props}>пока карточка загружается</code>
        </li>
        <li className={styles.cardCell}>
          <CatalogProductCardSkeleton variant="compact" />
          <code className={styles.props}>variant: compact</code>
        </li>
      </ul>
    </>
  );
}
