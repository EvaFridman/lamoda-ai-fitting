import { NextResponse, type NextRequest } from 'next/server';

import { categoryProxy, isCategoryPath } from '@/_pages/catalog/server';
import { sentryDsn } from '@/shared/config';
import { contentSecurityPolicy, newNonce, NONCE_HEADER } from '@/shared/csp/server';

// Runs before routing on every page. Each request gets a nonce and the Content Security Policy
// (spec 0014 plan §5): Next reads the nonce from the request's copy of the header and puts it on
// the scripts it renders per request; server components read it from NONCE_HEADER. nginx adds no
// policy of its own to an answer that carries this one. A category's unknown or inactive slug
// answers 404 (O65).
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const policy = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    sentryDsn,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('content-security-policy', policy);
  const response = isCategoryPath(request.nextUrl.pathname)
    ? await categoryProxy(request, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', policy);
  return response;
}

// Not Next's static files, images and `next dev`'s HMR socket, nor what nginx sends elsewhere in
// production (`/api/`, `/media/`, `/healthz` from inside): none is a page. Any other path may
// render one, a not-found page under `/_next/` too, so it gets the policy.
export const config = {
  matcher: '/((?!_next/static/|_next/image|_next/webpack-hmr|api/|media/|healthz$).*)',
};
