import { connection } from 'next/server';

import { HeaderProfile } from './header-profile';

// The profile renders per request, as the search does (spec 0010 L10): in the prerendered shell the
// login modal's `useSearchParams` would make React render it in the browser only. Wrap it in
// <Suspense>.
export async function HeaderProfileSlot() {
  await connection();
  return <HeaderProfile />;
}
