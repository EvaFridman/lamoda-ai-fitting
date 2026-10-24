import 'server-only';

import { connection } from 'next/server';
import { setTimeout as sleep } from 'node:timers/promises';

import { readActiveCategories } from '@/entities/category/server';
import { readFirstProduct } from '@/entities/product/server';

// The deploy's warm-up (spec 0018 plan §4, V7, V8): every route a visitor reaches without signing
// in, requested from the new copy before the switch so its first visitors find the page cache full.
// A route of `web/app` is either here or in `EXCLUDED` (`routes.test.ts` fails otherwise).
// `static`: the route is its address. `redirect`: no file backs it, `redirects()` in
// `next.config.ts` answers (307). `categories`: one address per active category. `products`: the
// newest product of each of the first active categories (spec 0019 A81).
export const WARMUP = [
  { route: '/', source: 'redirect' },
  { route: '/catalog', source: 'static' },
  { route: '/catalog/[slug]', source: 'categories' },
  { route: '/catalog/opengraph-image', source: 'static' },
  { route: '/catalog/twitter-image', source: 'static' },
  { route: '/privacy', source: 'static' },
  { route: '/products/[id]', source: 'products' },
  { route: '/sitemap.xml', source: 'static' },
  { route: '/robots.txt', source: 'static' },
] as const satisfies readonly {
  route: string;
  source: 'static' | 'redirect' | 'categories' | 'products';
}[];

// Never warmed up, each with its reason. `/x/*` stands for `/x` and every route under it.
export const EXCLUDED: Readonly<Record<string, string>> = {
  '/customer/*': 'the account (spec 0017): the user’s data, read in the browser only',
  '/ui-kit': 'the kit’s examples, not for visitors',
  '/healthz': 'the container’s health check',
  '/healthz/warmup': 'this list itself',
};

// The bound on category pages (V16): with about three api reads each, 50 and the other pages stay
// within two thirds of the `read` tier's minute quota.
export const WARMUP_CATEGORY_MAX = 50;

// The categories whose newest product is warmed up (A81): with the 50 category pages, about 82
// pages at one a second, about 100 s of V16's 120 for the whole step; at the full bounds the cold
// pass's last minute is about 205 api reads, a little over V16's 200 (A81 (4)).
export const WARMUP_PRODUCT_MAX = 25;

// The products' reads one after another, at most 5 a second, under web's own `read` quota (10).
export const PRODUCT_READ_INTERVAL_MS = 200;

export interface WarmupList {
  paths: string[];
  // Category and product pages over their bounds, not requested (the deploy log prints the count).
  skipped: number;
}

// The newest product of each of the first `WARMUP_PRODUCT_MAX` categories, read past the page cache
// (V7), one at a time; a category with no product has no address.
async function firstProducts(categoryIds: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, categoryId] of categoryIds.entries()) {
    if (index > 0) await sleep(PRODUCT_READ_INTERVAL_MS);
    const product = await readFirstProduct(categoryId);
    if (product !== undefined) ids.push(product.id);
  }
  return ids;
}

// The addresses at request time: a category added since the build is warmed up by the next deploy
// (AC11). The categories come from the api, not the page cache: a copy rolled back to may hold an
// hour-old list, whose category made inactive since would answer 404 (V7). One read of the
// categories and one per product's category per deploy. A failed read throws, so the step fails
// rather than warm a partial list.
export async function warmupList(): Promise<WarmupList> {
  await connection();
  const { items, total } = await readActiveCategories();
  const active = Math.max(total, items.length);
  const categories = items.slice(0, WARMUP_CATEGORY_MAX);
  const productCategories = items.slice(0, WARMUP_PRODUCT_MAX);
  const products = await firstProducts(productCategories.map((category) => category.id));
  const paths = WARMUP.flatMap(({ route, source }) => {
    switch (source) {
      case 'categories':
        return categories.map((category) => `/catalog/${encodeURIComponent(category.slug)}`);
      case 'products':
        return products.map((id) => `/products/${encodeURIComponent(id)}`);
      default:
        return [route];
    }
  });
  return {
    paths,
    skipped: active - categories.length + (active - productCategories.length),
  };
}

// GET /healthz/warmup, reached only from inside the container: nginx answers 404 for `/healthz`
// and everything under it.
export async function warmupRoute(): Promise<Response> {
  return Response.json(await warmupList(), { headers: { 'cache-control': 'no-store' } });
}
