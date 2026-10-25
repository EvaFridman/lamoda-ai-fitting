import { connection } from 'next/server';

import { loadHeaderCategories } from './header-categories';
import { HeaderMenu } from './header-menu';

// The burger's menu renders per request, as the profile does (spec 0010 L10): its login modal reads
// the query. Its categories are the header row's, the same read once per render (spec 0019 A87.6).
// Wrap it in <Suspense>.
export async function HeaderMenuSlot() {
  await connection();
  const categories = await loadHeaderCategories();
  return <HeaderMenu categories={categories.map(({ id, slug, name }) => ({ id, slug, name }))} />;
}
