'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { SearchField } from '@/shared/ui';

// The api's limit for the product search (`SEARCH_MAX_LENGTH`). A longer query would only make the
// URL long enough for a server to refuse it (L11).
export const QUERY_MAX_LENGTH = 100;

// The header's search (spec 0010 L8): shows `q` from the URL and puts a submitted query there,
// keeping the page's other parameters but the catalog's batch cursor: a new search starts at its
// first batch (spec 0014 O81). The field is uncontrolled, so neither the query nor typed text becomes an attribute (L9);
// `key` starts it again from a new `q` (back, another link). Render it per request inside
// <Suspense> (L10).
export function HeaderSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query = (searchParams.get('q') ?? '').slice(0, QUERY_MAX_LENGTH);

  // The kit calls this only with a trimmed, non-empty query.
  function search(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cursor');
    params.set('q', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <SearchField key={query} defaultValue={query} maxLength={QUERY_MAX_LENGTH} onSearch={search} />
  );
}
