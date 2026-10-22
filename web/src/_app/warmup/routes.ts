import 'server-only';

import { connection } from 'next/server';

import { readActiveCategories } from '@/entities/category/server';

// The deploy's warm-up (spec 0018 plan §4, V7, V8): every route a visitor reaches without signing
// in, requested from the new copy before the switch so its first visitors find the page cache full.
// A route of `web/app` is either here or in `EXCLUDED` (`routes.test.ts` fails otherwise).
// `static`: the route is its address. `redirect`: no file backs it, `redirects()` in
// `next.config.ts` answers (307). `categories`: one address per active category.
export const WARMUP = [
  { route: '/', source: 'redirect' },
  { route: '/catalog', source: 'static' },
  { route: '/catalog/[slug]', source: 'categories' },
  { route: '/catalog/opengraph-image', source: 'static' },
  { route: '/catalog/twitter-image', source: 'static' },
  { route: '/privacy', source: 'static' },
  { route: '/sitemap.xml', source: 'static' },
  { route: '/robots.txt', source: 'static' },
] as const satisfies readonly { route: string; source: 'static' | 'redirect' | 'categories' }[];

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

export interface WarmupList {
  paths: string[];
  // Active categories over the bound, not requested (the deploy log prints the count).
  skipped: number;
}

// The addresses at request time: a category added since the build is warmed up by the next deploy
// (AC11). The categories come from the api, not the page cache: a copy rolled back to may hold an
// hour-old list, whose category made inactive since would answer 404 (V7). One read per deploy. A
// failed read throws, so the step fails rather than warm a partial list.
export async function warmupList(): Promise<WarmupList> {
  await connection();
  const { items, total } = await readActiveCategories();
  const categories = items.slice(0, WARMUP_CATEGORY_MAX);
  const paths = WARMUP.flatMap(({ route, source }) =>
    source === 'categories'
      ? categories.map((category) => `/catalog/${encodeURIComponent(category.slug)}`)
      : [route],
  );
  return { paths, skipped: Math.max(total, items.length) - categories.length };
}

// GET /healthz/warmup, reached only from inside the container: nginx answers 404 for `/healthz`
// and everything under it.
export async function warmupRoute(): Promise<Response> {
  return Response.json(await warmupList(), { headers: { 'cache-control': 'no-store' } });
}
