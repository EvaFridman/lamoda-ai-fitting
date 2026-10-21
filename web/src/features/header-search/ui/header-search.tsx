'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { SearchField } from '@/shared/ui';

import { markSearchSubmitted } from '../model/submitted-search';

// The api's limit for the product search (`SEARCH_MAX_LENGTH`). A longer query would only make the
// URL long enough for a server to refuse it (L11).
export const QUERY_MAX_LENGTH = 100;

// The header's search: shows `q` from the URL and opens the catalog's search for a submitted
// query, from any page, with no category, filter, sort or batch cursor (spec 0014 O15, O81). The
// field is uncontrolled, so neither the query nor typed text becomes an attribute (spec 0010 L9);
// `key` starts it again from a new `q` (back, another link). Render it per request inside
// <Suspense> (L10).
export function HeaderSearch() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = (searchParams.get('q') ?? '').slice(0, QUERY_MAX_LENGTH);

  // The kit calls this only with a trimmed, non-empty query. Marked first, for the catalog's
  // `Catalog Searched` (O105).
  function search(next: string) {
    markSearchSubmitted(next);
    router.push(`/catalog?${new URLSearchParams({ q: next }).toString()}`);
  }

  return (
    <SearchField key={query} defaultValue={query} maxLength={QUERY_MAX_LENGTH} onSearch={search} />
  );
}
