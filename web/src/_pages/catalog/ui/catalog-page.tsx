import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getCategoryBySlug } from '@/entities/category/server';
import { isRefusedCursor, type ProductBatchQuery } from '@/entities/product';
import { productFacetsOptions, productInfiniteOptions } from '@/entities/product/server';
import { errorText, reportFailure } from '@/shared/api';
import { prefetch, prefetchInfinite } from '@/shared/api/server';

import { type CatalogUrlState, parseCatalogUrl } from '../model/url-state';
import { CatalogBrowser } from './catalog-browser';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface CatalogPageProps {
  searchParams: SearchParams;
}

export interface CategoryPageProps extends CatalogPageProps {
  params: Promise<{ slug: string }>;
}

// `/catalog`: every active product. The heading stays static; the products render per request.
export function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <main>
      <h1>Каталог</h1>
      <Suspense fallback={null}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// A category's page. Its own component, not CatalogPage with optional params: Next passes `params`
// to every page, `/catalog`'s too.
export function CategoryPage({ params, searchParams }: CategoryPageProps) {
  return (
    <main>
      <Suspense fallback={null}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CatalogContent({ searchParams }: CatalogPageProps) {
  return <CatalogProducts state={parseCatalogUrl(await searchParams)} />;
}

async function CategoryContent({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  let category;
  try {
    category = await getCategoryBySlug(slug);
  } catch (error) {
    reportFailure(error);
    return <p role="alert">{errorText(error)}</p>;
  }
  // `proxy.ts` answers 404 before this (O65). What it lets through ends here as a soft 404: a
  // category deactivated since, a prefetch (not checked) and a request whose check failed.
  if (!category?.isActive) notFound();
  const state = parseCatalogUrl(await searchParams);
  // The heading goes out without waiting for the products.
  return (
    <>
      <h1>{category.name}</h1>
      <Suspense fallback={null}>
        <CatalogProducts state={state} categoryId={category.id} />
      </Suspense>
    </>
  );
}

interface CatalogProductsProps {
  state: CatalogUrlState;
  categoryId?: string;
}

// The first batch (the one after `?cursor=`, O29) and the filter counts, loaded here and handed to
// the browser's list under the same keys (plan §3.3). A cursor the api refuses shows the first
// batch (O72). A failed batch is not dehydrated: the list shows its text and requests the batch
// again (O74); failed counts are requested by the browser, and the list goes without them till then.
async function CatalogProducts({ state, categoryId }: CatalogProductsProps) {
  const { query } = state;
  const batchQuery: ProductBatchQuery =
    categoryId === undefined ? query : { ...query, categoryId: [categoryId] };
  const queryClient = new QueryClient();
  const facets = prefetch(queryClient, productFacetsOptions(batchQuery));
  let start = state.cursor;
  let failure = await prefetchInfinite(queryClient, productInfiniteOptions(batchQuery, start));
  if (start !== undefined && isRefusedCursor(failure)) {
    start = undefined;
    failure = await prefetchInfinite(queryClient, productInfiniteOptions(batchQuery));
  }
  const facetsFailure = await facets;
  if (facetsFailure !== undefined) reportFailure(facetsFailure);
  if (failure !== undefined) reportFailure(failure);
  // Only what loaded is dehydrated (TanStack skips failed queries). Next keeps the page mounted
  // when only the query changes, so another start is another list (and grid), by its key.
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogBrowser
        key={start ?? ''}
        query={query}
        categoryId={categoryId}
        start={start}
        failureText={failure === undefined ? undefined : errorText(failure)}
      />
    </HydrationBoundary>
  );
}
