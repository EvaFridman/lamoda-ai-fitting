import { connection } from 'next/server';

import { type Category } from '@/entities/category';
import { getCategories } from '@/entities/category/server';
import { reportFailure } from '@/shared/api';

import styles from './header.module.scss';

// The api's page maximum: more categories than that would not fit one row anyway (plan §2).
const CATEGORY_LIMIT = 100;

// A failed call leaves the row empty and the page still answers 200 (spec 0010 L3, AC5; web's
// health check fetches `/`); the api layer has reported an api failure to Sentry, `reportFailure`
// reports anything else.
async function load(): Promise<Category[]> {
  try {
    return (await getCategories({ isActive: true, limit: CATEGORY_LIMIT })).items;
  } catch (error) {
    reportFailure(error);
    return [];
  }
}

// The active categories in the api's order (sortOrder, then name), as plain text until the catalog
// page exists (L4). Renders per request, never at build time: `connection()` stops prerendering
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
        <li key={category.id}>{category.name}</li>
      ))}
    </ul>
  );
}
