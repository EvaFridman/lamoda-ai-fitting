import { connection } from 'next/server';

import { HeaderSearch } from '@/features/header-search';

import { HeaderLoupe, HeaderSearchRow } from './header-search-toggle';

// The phone row's loupe, per request for the same reason: it is drawn open with `q`. Wrap it in
// <Suspense>.
export async function HeaderLoupeSlot() {
  await connection();
  return <HeaderLoupe />;
}

// The search renders per request, never into the prerendered shell (spec 0010 L10): there
// `useSearchParams` would make React render it in the browser in place of the fallback field and
// drop what was typed into it. Rendered on the server with the real `q`, it hydrates instead, and
// the kit keeps text typed before hydration. Its row opens and closes by the phone row's loupe
// (spec 0019 A87.5). Wrap it in <Suspense>.
export async function HeaderSearchSlot() {
  await connection();
  return (
    <HeaderSearchRow>
      <HeaderSearch />
    </HeaderSearchRow>
  );
}
