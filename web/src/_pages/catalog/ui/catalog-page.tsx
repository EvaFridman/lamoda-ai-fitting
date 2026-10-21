import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getCategoryBySlug } from '@/entities/category/server';
import type { ProductBatchQuery } from '@/entities/product';
import { productInfiniteOptions } from '@/entities/product/server';
import { errorText, reportFailure } from '@/shared/api';
import { prefetchInfinite } from '@/shared/api/server';

import { type CatalogSearchParams, parseCatalogUrl } from '../model/url-state';
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
  return <CatalogProducts query={queryOf(await searchParams)} />;
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
  const query = { ...queryOf(await searchParams), categoryId: [category.id] };
  // The heading goes out without waiting for the products.
  return (
    <>
      <h1>{category.name}</h1>
      <Suspense fallback={null}>
        <CatalogProducts query={query} />
      </Suspense>
    </>
  );
}

// The cursor is T14's: until then every address shows its first batch (O72).
function queryOf(searchParams: CatalogSearchParams): ProductBatchQuery {
  return parseCatalogUrl(searchParams).query;
}

// The first batch, loaded here and handed to the browser's list under the same key (plan §3.3).
// A failure is not dehydrated: the list shows its text and requests the batch again (O74).
async function CatalogProducts({ query }: { query: ProductBatchQuery }) {
  const queryClient = new QueryClient();
  const failure = await prefetchInfinite(queryClient, productInfiniteOptions(query));
  if (failure !== undefined) {
    reportFailure(failure);
    return <CatalogBrowser query={query} failureText={errorText(failure)} />;
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogBrowser query={query} />
    </HydrationBoundary>
  );
}
