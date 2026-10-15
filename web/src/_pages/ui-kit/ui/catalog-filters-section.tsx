import { CatalogFiltersDemo } from './catalog-filters-demo';
import styles from './examples.module.scss';

// The catalog's filters of entities/product and the category list of entities/category, built
// from the example filter counts, live.
export function CatalogFiltersSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую. Фильтры собраны из счётчиков
        каталога; под ними — последнее значение, которое сообщил фильтр.
      </p>

      <h3 className={styles.heading}>
        ProductSortFilter, ColorFilter, AttributeFilter, BrandFilter, SizeFilter, PriceRangeFilter,
        DiscountFilter
      </h3>
      <CatalogFiltersDemo />
    </>
  );
}
