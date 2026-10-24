import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { findCategoryById } from '@/entities/category/server';
import { findProduct } from '@/entities/product/server';

// A path no route matches (a `_` folder is never a route), so Next answers it with a 404 status and
// the site's not-found page.
const NOT_FOUND_PATH = '/_product-not-found';

// Next's header on a `<Link>`'s prefetch.
const PREFETCH_HEADER = 'next-router-prefetch';

// A product page's path, `/products/<id>`: the paths `productProxy` is for.
export function isProductPath(pathname: string): boolean {
  return /^\/products\/[^/]+$/.test(pathname);
}

// The 404 of an unknown product or one of an inactive category (AC21, spec 0019 A81), decided here,
// before routing, as a category's is (0014 O65): the page streams its shell with 200 first. Both
// reads go on the visitor's behalf; the page cache is not used here. An api failure lets the request
// through: the page reads again and shows the error. Prefetches pass unchecked, so the catalog's
// cards do not each cost the visitor two reads; the navigation itself is checked. `requestHeaders`
// go on to the page either way (the CSP's nonce, `proxy.ts`).
export async function productProxy(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<NextResponse> {
  const init = requestHeaders ? { request: { headers: requestHeaders } } : undefined;
  if (request.headers.has(PREFETCH_HEADER)) return NextResponse.next(init);
  const notFound = () => NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), init);
  let id: string;
  try {
    id = decodeURIComponent(request.nextUrl.pathname.split('/')[2] ?? '');
  } catch {
    return notFound();
  }
  try {
    const product = await findProduct(id, request.headers);
    if (product === null) return notFound();
    const category = await findCategoryById(product.category.id, request.headers);
    return category?.isActive ? NextResponse.next(init) : notFound();
  } catch {
    // Any failure (an ApiError, reported by apiFetch when it should be, or a broken env) lets the
    // request through: the page reads again, shows the error and reports it.
    return NextResponse.next(init);
  }
}
