'use client';

import { useEffect, useState } from 'react';

import { isRefusedCursor, useProductBatches, useProductFacets } from '@/entities/product';
import { errorText, reportFailure } from '@/shared/api';
import { ProductGrid } from '@/widgets/product-grid';

import { type CatalogQuery, catalogSearch } from '../model/url-state';

export interface CatalogBrowserProps {
  // The address's state.
  query: CatalogQuery;
  // The path's category, if any (O73).
  categoryId?: string;
  // The batch to start from: the address's cursor, unless the api refused it (O72).
  start?: string;
  // The server's error text when its first batch failed: shown, without JavaScript too, until
  // the browser's own request answers (O74).
  failureText?: string;
}

// The client part of the page (plan §3.2). It starts from the batch and the counts the server
// prefetched under the same keys, so it makes no request on load; after a server failure it
// requests the batch itself.
export function CatalogBrowser({ query, categoryId, start, failureText }: CatalogBrowserProps) {
  const batchQuery = categoryId === undefined ? query : { ...query, categoryId: [categoryId] };
  const [from, setFrom] = useState(start ?? null);
  const { data, error, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    useProductBatches(batchQuery, from);
  const facets = useProductFacets(batchQuery);

  // A start cursor the api refused in the browser's own request (the server's failed first): the
  // first batch instead, as on the server (O72). A refused next cursor keeps the loaded batches.
  if (from !== null && data === undefined && isRefusedCursor(error)) setFrom(null);

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  if (data === undefined) {
    const text = error === null ? failureText : errorText(error);
    return text === undefined ? null : <p role="alert">{text}</p>;
  }
  const products = data.pages.flatMap((page) => page.items);
  const next = data.pages.at(-1)?.nextCursor ?? null;
  return (
    <>
      <ProductGrid
        products={products}
        total={facets.data?.total}
        // Not during a refetch of the loaded batches either: a next batch asked for then is
        // dropped, and the grid asks again once this turns back on.
        canLoadMore={hasNextPage && !isFetching && !isFetchNextPageError}
        onLoadMore={() => void fetchNextPage({ cancelRefetch: false })}
        moreHref={next === null ? undefined : catalogSearch({ query, cursor: next })}
        showMore={isFetchNextPageError}
      />
      {isFetchNextPageError ? <p role="alert">{errorText(error)}</p> : null}
    </>
  );
}
