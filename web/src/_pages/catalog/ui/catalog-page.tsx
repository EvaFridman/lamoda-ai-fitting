import 'server-only';

import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getCategoryBySlug } from '@/entities/category/server';
import { errorText, reportFailure } from '@/shared/api';

export interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

// Placeholders until the catalog is built: the heading only (spec 0014 T11).
export function CatalogPage() {
  return (
    <main>
      <h1>Каталог</h1>
    </main>
  );
}

// A category's page. Its own component, not CatalogPage with optional params: Next passes `params`
// to every page, `/catalog`'s too.
export function CategoryPage({ params }: CategoryPageProps) {
  return (
    <main>
      <Suspense fallback={null}>
        <CategoryHeading params={params} />
      </Suspense>
    </main>
  );
}

async function CategoryHeading({ params }: CategoryPageProps) {
  const { slug } = await params;
  let category;
  try {
    category = await getCategoryBySlug(slug);
  } catch (error) {
    reportFailure(error);
    return <p role="alert">{errorText(error)}</p>;
  }
  // `proxy.ts` answers 404 before this (O65). What it lets through ends here as a soft 404: a
  // category deactivated since, a prefetch (not checked) and a request whose check failed.
  if (!category?.isActive) notFound();
  return <h1>{category.name}</h1>;
}
