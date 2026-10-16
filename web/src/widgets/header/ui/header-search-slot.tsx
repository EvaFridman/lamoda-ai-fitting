import { connection } from 'next/server';

import { HeaderSearch } from '@/features/header-search';

// The search renders per request, never into the prerendered shell (spec 0010 L10): there
// `useSearchParams` would make React render it in the browser in place of the fallback field and
// drop what was typed into it. Rendered on the server with the real `q`, it hydrates instead, and
// the kit keeps text typed before hydration. Wrap it in <Suspense>.
export async function HeaderSearchSlot() {
  await connection();
  return <HeaderSearch />;
}
