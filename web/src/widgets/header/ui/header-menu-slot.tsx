import { connection } from 'next/server';

import { loadHeaderCategories } from './header-categories';
import { loadHeaderCities } from './header-cities';
import { HeaderMenu } from './header-menu';

// The burger's menu renders per request, as the profile does (spec 0010 L10): its login modal reads
// the query. Its categories are the header row's and its cities the header button's (spec 0019
// A87.6, 0026 C5), the same reads once per render. Wrap it in <Suspense>.
export async function HeaderMenuSlot() {
  await connection();
  const [categories, cities] = await Promise.all([loadHeaderCategories(), loadHeaderCities()]);
  return (
    <HeaderMenu
      categories={categories.map(({ id, slug, name }) => ({ id, slug, name }))}
      cities={cities}
    />
  );
}
