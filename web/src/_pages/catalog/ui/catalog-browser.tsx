'use client';

import { useEffect } from 'react';

import { CatalogProductCard, type ProductBatchQuery, useProductBatches } from '@/entities/product';
import { errorText, reportFailure } from '@/shared/api';

import styles from './catalog-browser.module.scss';

export interface CatalogBrowserProps {
  // The page's query: the address's state plus the path's category.
  query: ProductBatchQuery;
  // The server's error text when its first batch failed: shown, without JavaScript too, until
  // the browser's own request answers (O74).
  failureText?: string;
}

// The client part of the page (plan §3.2). It starts from the batch the server prefetched under the
// same key, so it makes no request on load; after a server failure it requests the batch itself.
export function CatalogBrowser({ query, failureText }: CatalogBrowserProps) {
  const { data, error } = useProductBatches(query);

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  if (data === undefined) {
    const text = error === null ? failureText : errorText(error);
    return text === undefined ? null : <p role="alert">{text}</p>;
  }
  const products = data.pages.flatMap((page) => page.items);
  return (
    <ul className={styles.list}>
      {products.map((product) => (
        <li key={product.id}>
          <CatalogProductCard
            product={product}
            href={`/products/${encodeURIComponent(product.id)}`}
            // No product page yet: a prefetch would be a 404 per card (O75).
            prefetch={false}
          />
        </li>
      ))}
    </ul>
  );
}
