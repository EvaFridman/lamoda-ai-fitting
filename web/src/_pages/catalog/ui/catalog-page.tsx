import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { categoryListOptions, getCategoryBySlug } from '@/entities/category/server';
import { isRefusedCursor, type ProductBatchQuery } from '@/entities/product';
import { productFacetsOptions, productInfiniteOptions } from '@/entities/product/server';
import { errorText, reportFailure } from '@/shared/api';
import { prefetch, prefetchInfinite } from '@/shared/api/server';
import { requestNonce } from '@/shared/csp/server';
import { Breadcrumbs } from '@/shared/ui';

import { catalogCategoriesQuery } from '../model/categories';
import { type CatalogUrlState, parseCatalogUrl } from '../model/url-state';
import { CatalogBrowser } from './catalog-browser';
import { CatalogHeading } from './catalog-heading';
import { CatalogJsonLd, type CatalogJsonLdProps } from './catalog-json-ld';

import styles from './catalog-page.module.scss';

const catalogTitle = 'Каталог';
const catalogCrumb = { name: catalogTitle, path: '/catalog' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface CatalogPageProps {
  searchParams: SearchParams;
}

export interface CategoryPageProps extends CatalogPageProps {
  params: Promise<{ slug: string }>;
}

// `/catalog`: every active product. The breadcrumbs and the heading stay static; the products, and
// the heading's count with them, render per request.
export function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <main className={styles.page}>
      <Breadcrumbs items={[{ label: catalogTitle }]} />
      <Suspense fallback={<CatalogHeading title={catalogTitle} />}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// A category's page. Its own component, not CatalogPage with optional params: Next passes `params`
// to every page, `/catalog`'s too.
export function CategoryPage({ params, searchParams }: CategoryPageProps) {
  return (
    <main className={styles.page}>
      <Suspense fallback={null}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CatalogContent({ searchParams }: CatalogPageProps) {
  return (
    <CatalogProducts
      title={catalogTitle}
      state={parseCatalogUrl(await searchParams)}
      breadcrumbs={[catalogCrumb]}
    />
  );
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
  // The breadcrumbs and the heading go out without waiting for the products.
  return (
    <>
      <Breadcrumbs items={[{ label: catalogTitle, href: '/catalog' }, { label: category.name }]} />
      <Suspense fallback={<CatalogHeading title={category.name} />}>
        <CatalogProducts
          title={category.name}
          state={state}
          categoryId={category.id}
          breadcrumbs={[
            catalogCrumb,
            { name: category.name, path: `/catalog/${encodeURIComponent(category.slug)}` },
          ]}
        />
      </Suspense>
    </>
  );
}

interface CatalogProductsProps {
  title: string;
  state: CatalogUrlState;
  categoryId?: string;
  // The structured data's trail (O27), as the page's breadcrumbs show it.
  breadcrumbs: CatalogJsonLdProps['breadcrumbs'];
}

// The first batch (the one after `?cursor=`, O29), the filter counts and the categories' slugs,
// loaded here and handed to the browser's list under the same keys (plan §3.3). A cursor the api
// refuses shows the first batch (O72). A failed batch is not dehydrated: the list shows its text
// and requests the batch again (O74); failed counts or categories are requested by the browser, and
// the page goes without them till then.
async function CatalogProducts({ title, state, categoryId, breadcrumbs }: CatalogProductsProps) {
  const { query } = state;
  const batchQuery: ProductBatchQuery =
    categoryId === undefined ? query : { ...query, categoryId: [categoryId] };
  const queryClient = new QueryClient();
  const facets = prefetch(queryClient, productFacetsOptions(batchQuery));
  const categories = prefetch(queryClient, categoryListOptions(catalogCategoriesQuery));
  let start = state.cursor;
  let failure = await prefetchInfinite(queryClient, productInfiniteOptions(batchQuery, start));
  if (start !== undefined && isRefusedCursor(failure)) {
    start = undefined;
    failure = await prefetchInfinite(queryClient, productInfiniteOptions(batchQuery));
  }
  for (const other of await Promise.all([facets, categories])) {
    if (other !== undefined) reportFailure(other);
  }
  if (failure !== undefined) reportFailure(failure);
  const firstBatch = queryClient.getQueryData(productInfiniteOptions(batchQuery, start).queryKey)
    ?.pages[0];
  const nonce = await requestNonce();
  // Only what loaded is dehydrated (TanStack skips failed queries). Next keeps the page mounted
  // when only the query changes; the browser starts another list (and grid) for another start.
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogJsonLd
        breadcrumbs={breadcrumbs}
        products={firstBatch?.items ?? []}
        isCatalogRoot={categoryId === undefined}
        nonce={nonce}
      />
      <CatalogBrowser
        title={title}
        query={query}
        categoryId={categoryId}
        start={start}
        failureText={failure === undefined ? undefined : errorText(failure)}
      />
    </HydrationBoundary>
  );
}
