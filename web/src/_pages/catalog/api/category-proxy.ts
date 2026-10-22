import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { findCategoryBySlug } from '@/entities/category/server';

// A path no route matches (a `_` folder is never a route), so Next answers it with a 404 status and
// the site's not-found page.
const NOT_FOUND_PATH = '/_category-not-found';

// Next's header on a `<Link>`'s prefetch.
const PREFETCH_HEADER = 'next-router-prefetch';

// The catalog's own routes at a slug's place: its link preview images (plan §3.5).
const OWN_ROUTES = new Set(['opengraph-image', 'twitter-image']);

// A category page's path, `/catalog/<slug>`: the paths `categoryProxy` is for.
export function isCategoryPath(pathname: string): boolean {
  return /^\/catalog\/[^/]+$/.test(pathname);
}

// The 404 of an unknown or inactive category (AC2). A page streams its static shell with 200 before
// it reads anything (`cacheComponents`), so the slug is checked here, before routing (O65). An api
// failure lets the request through: the page shows the error. Prefetches pass unchecked, so a page's
// category links do not each cost a read of the visitor's quota; the navigation itself is checked.
// `requestHeaders` go on to the page either way (the CSP's nonce, `proxy.ts`).
export async function categoryProxy(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<NextResponse> {
  const init = requestHeaders ? { request: { headers: requestHeaders } } : undefined;
  if (request.headers.has(PREFETCH_HEADER)) return NextResponse.next(init);
  const segment = request.nextUrl.pathname.split('/')[2] ?? '';
  if (OWN_ROUTES.has(segment)) return NextResponse.next(init);
  let slug: string;
  try {
    slug = decodeURIComponent(segment);
  } catch {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), init);
  }
  try {
    const category = await findCategoryBySlug(slug, request.headers);
    return category?.isActive
      ? NextResponse.next(init)
      : NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), init);
  } catch {
    // Any failure (an ApiError, reported by apiFetch when it should be, or a broken env) lets the
    // request through: the page reads again, shows the error and reports it.
    return NextResponse.next(init);
  }
}
