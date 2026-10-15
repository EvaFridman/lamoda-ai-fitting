'use client';

import { useId, useState } from 'react';

import { useProductFacets, useProducts } from '@/entities/product';
import { Checkbox, CheckboxGroup, Pagination, Price } from '@/shared/ui';

import { PAGE_SIZE, productPageQuery } from '../config/query';
import styles from './dev-catalog-page.module.scss';
import { QueryError } from './query-error';

// The browser half (plan §9): starts from the server's data with no request (H5); a brand or a page
// picked here is requested from the browser through `/api`. Filter state stays in the component, not
// the address (spec 0007 non-goals).
export function CatalogBrowser() {
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  function changeBrands(next: string[]) {
    setBrandIds(next);
    setPage(1);
  }

  return (
    <div className={styles.catalog}>
      <BrandFilter value={brandIds} onChange={changeBrands} />
      <ProductPage brandIds={brandIds} page={page} onPageChange={setPage} />
    </div>
  );
}

function BrandFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const headingId = useId();
  const facets = useProductFacets();

  return (
    <section className={styles.filter}>
      <h2 id={headingId} className={styles.heading}>
        Бренд
      </h2>
      {facets.error ? <QueryError error={facets.error} /> : null}
      {facets.data ? (
        <CheckboxGroup aria-labelledby={headingId} value={value} onValueChange={onChange}>
          {facets.data.brands.map((brand) => (
            <Checkbox key={brand.id} value={brand.id}>
              {brand.name} ({brand.count})
            </Checkbox>
          ))}
        </CheckboxGroup>
      ) : null}
      {facets.isPending ? <p className={styles.muted}>Загрузка…</p> : null}
    </section>
  );
}

function ProductPage({
  brandIds,
  page,
  onPageChange,
}: {
  brandIds: string[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const products = useProducts(productPageQuery(brandIds, page));
  // The last list that loaded stays on screen while the next page loads and after it fails, so the
  // pagination keeps its place and the keyboard focus. Kept here, not with `keepPreviousData`: TanStack
  // drops that placeholder when the new key fails.
  const [shown, setShown] = useState(products.data);
  if (products.data && products.data !== shown) setShown(products.data);
  const data = products.data ?? shown;

  if (!data) {
    if (products.error) return <QueryError error={products.error} />;
    return <p className={styles.muted}>Загрузка…</p>;
  }

  const { items, total } = data;
  return (
    <section className={styles.products} aria-busy={products.isPending}>
      <h2 className={styles.heading}>Товары: {total}</h2>
      {/* A failed refetch (H22) or page keeps the data shown and says why above it. */}
      {products.error ? <QueryError error={products.error} /> : null}
      <ul className={styles.list}>
        {items.map((product) => (
          <li key={product.id} className={styles.item}>
            <span>
              {product.brand.name} · {product.name}
            </span>
            <Price
              price={product.finalPrice}
              oldPrices={product.discount > 0 ? [product.price] : undefined}
            />
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE ? (
        <Pagination
          page={page}
          pageCount={Math.ceil(total / PAGE_SIZE)}
          shown={(page - 1) * PAGE_SIZE + items.length}
          total={total}
          onPageChange={onPageChange}
          aria-label="Страницы товаров"
        />
      ) : null}
    </section>
  );
}
