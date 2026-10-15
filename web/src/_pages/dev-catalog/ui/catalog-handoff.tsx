import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { connection } from 'next/server';

import { productFacetsOptions, productListOptions } from '@/entities/product/server';
import { errorText, reportFailure } from '@/shared/api';
import { prefetch } from '@/shared/api/server';

import { productPageQuery } from '../config/query';
import { CatalogBrowser } from './catalog-browser';
import styles from './dev-catalog-page.module.scss';

// The server half of the page (plan §4, §9): page 1 of the products and the brand facets, loaded
// through `apiFetch` (the slices' `server` options; their browser options would throw
// `ClientFetchOnServer` here, H31) and handed to the browser's cache. A failure shows its text and is
// not handed over, so the browser asks again; `reportFailure` reports one that is not an `ApiError`
// (H29), the api layer has reported the rest. Renders per request: `connection()` stops prerendering,
// so the build needs no api. Wrap it in <Suspense>.
export async function CatalogHandoff() {
  await connection();
  const queryClient = new QueryClient();
  const [products, facets] = await Promise.all([
    prefetch(queryClient, productListOptions(productPageQuery([], 1))),
    prefetch(queryClient, productFacetsOptions()),
  ]);
  const failures = Object.entries({ products, facets }).filter(([, error]) => error !== undefined);
  for (const [, error] of failures) reportFailure(error);

  return (
    <>
      {failures.map(([name, error]) => (
        <p key={name} className={styles.error} role="alert">
          На сервере ({name}): {errorText(error)}
        </p>
      ))}
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CatalogBrowser />
      </HydrationBoundary>
    </>
  );
}
