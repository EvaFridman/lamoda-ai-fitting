import NextLink from 'next/link';
import { connection } from 'next/server';

import type { Category } from '@/entities/category';
import { getActiveCategories } from '@/entities/category/server';
import { reportFailure } from '@/shared/api';

import styles from './header.module.scss';

// A failed call leaves the row empty and the page still answers 200 (spec 0010 L3, AC5; web's
// health check fetches `/`); the api layer has reported an api failure to Sentry, `reportFailure`
// reports anything else.
async function load(): Promise<Category[]> {
  try {
    // More categories than the api's page would not fit one row anyway (plan §2); the same read a
    // category page's lookup makes, once per render.
    return (await getActiveCategories()).items;
  } catch (error) {
    reportFailure(error);
    return [];
  }
}

// The active categories in the api's order (sortOrder, then name), each a link to its catalog page
// (spec 0014 O16). Renders per request, never at build time: `connection()` stops prerendering
// here, so the build needs no api. Wrap it in <Suspense>.
export async function HeaderCategories() {
  await connection();
  const categories = await load();
  if (categories.length === 0) {
    return null;
  }
  return (
    <ul className={styles.categoryList}>
      {categories.map((category) => (
        <li key={category.id}>
          <NextLink
            href={`/catalog/${encodeURIComponent(category.slug)}`}
            className={styles.categoryLink}
          >
            {category.name}
          </NextLink>
        </li>
      ))}
    </ul>
  );
}
