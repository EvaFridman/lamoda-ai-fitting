import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ProductAbout } from '@/entities/product';
import { productOptions, relatedProductsOptions } from '@/entities/product/server';
import { errorText, reportFailure } from '@/shared/api';
import { prefetch } from '@/shared/api/server';
import { requestNonce } from '@/shared/csp/server';
import { Breadcrumbs } from '@/shared/ui';
import { ProductGallery } from '@/widgets/product-gallery';
import { RelatedProducts } from '@/widgets/related-products';

import { loadProductWithSlot } from '../model/load-product';
import { ProductJsonLd } from './product-json-ld';
import { ProductPurchase } from './product-purchase';
import { ProductSkeleton } from './product-skeleton';

import styles from './product-page.module.scss';

export interface ProductPageProps {
  params: Promise<{ id: string }>;
}

// `/products/<id>` (spec 0019 plan §8, board 1): the breadcrumbs, then the gallery and the buy box
// side by side (T20), «О товаре» and «С этим товаром выбирают» under them (T21). Everything renders
// per request; the visitor's own data (the session, the quota, «Вы это примеряли») is read in the
// browser only (AC23).
export function ProductPage({ params }: ProductPageProps) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </main>
  );
}

async function ProductContent({ params }: ProductPageProps) {
  const { id } = await params;
  let loaded;
  try {
    loaded = await loadProductWithSlot(id);
  } catch (error) {
    reportFailure(error);
    return (
      <p role="alert" className={styles.alert}>
        {errorText(error)}
      </p>
    );
  }
  // `proxy.ts` answers 404 before this (A81). What it lets through ends here as a soft 404: a
  // product whose category was deactivated since, a prefetch (not checked) and a request whose
  // check failed.
  if (loaded === null) notFound();
  const { product, slot } = loaded;
  const queryClient = new QueryClient();
  // The product as read for the visitor, under the browser's key, so its hooks need no request.
  queryClient.setQueryData(productOptions(product.id).queryKey, product);
  // A failure is not dehydrated: the block asks again in the browser.
  const related = await prefetch(queryClient, relatedProductsOptions(product));
  if (related !== undefined) reportFailure(related);
  const categoryPath = `/catalog/${encodeURIComponent(product.category.slug)}`;
  // As board 1 draws them: the category last, the product's name not a crumb.
  const crumbs = [
    { label: 'Каталог', href: '/catalog' },
    { label: product.category.name, href: categoryPath },
  ];
  const nonce = await requestNonce();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductJsonLd
        product={product}
        breadcrumbs={[
          { name: 'Каталог', path: '/catalog' },
          { name: product.category.name, path: categoryPath },
        ]}
        nonce={nonce}
      />
      <Breadcrumbs items={crumbs} className={styles.crumbs} />
      <div className={styles.main}>
        <ProductGallery product={product} className={styles.gallery} />
        <div className={styles.purchase}>
          <ProductPurchase product={product} hasSlot={slot !== null} />
        </div>
      </div>
      <ProductAbout product={product} className={styles.about} />
      <RelatedProducts productId={product.id} className={styles.related} />
    </HydrationBoundary>
  );
}
