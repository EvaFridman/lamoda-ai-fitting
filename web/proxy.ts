import { NextResponse, type NextRequest } from 'next/server';

import { categoryProxy, isCategoryPath } from '@/_pages/catalog/server';
import { sentryDsn } from '@/shared/config';
import { getServerEnv } from '@/shared/config/server';
import { contentSecurityPolicy, newNonce, NONCE_HEADER } from '@/shared/csp/server';

// Runs before routing on every page. Each request gets a nonce and the Content Security Policy
// (spec 0014 plan §5): Next reads the nonce from the request's copy of the header and puts it on
// the scripts it renders per request; server components read it from NONCE_HEADER. nginx adds no
// policy of its own to an answer that carries this one. A category's unknown or inactive slug
// answers 404 (O65).
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const storage = storageImages();
  const policy = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    sentryDsn,
    ...storage,
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

// Where users' photos load from (spec 0019). A broken server env fails the api reads with its
// message; here it only leaves the photos out, so a page that reads nothing still renders.
function storageImages(): {
  storageEndpoint: string | undefined;
  storageBucket: string | undefined;
} {
  try {
    const { S3_PUBLIC_ENDPOINT, S3_BUCKET } = getServerEnv();
    return { storageEndpoint: S3_PUBLIC_ENDPOINT, storageBucket: S3_BUCKET };
  } catch {
    return { storageEndpoint: undefined, storageBucket: undefined };
  }
}

// Not Next's static files, images and `next dev`'s HMR socket, nor what nginx sends elsewhere in
// production (`/api/`, `/media/`, `/socket.io/`, `/healthz` and `/healthz/warmup` from inside):
// none is a page. Any other path may render one, a not-found page under `/_next/` too, so it gets
// the policy: `/socket.io` without the slash as well, which only `next dev` forwards to the api
// (`@/shared/realtime`), where the policy on its answer does nothing.
export const config = {
  matcher:
    '/((?!_next/static/|_next/image|_next/webpack-hmr|api/|media/|socket\\.io/|healthz$|healthz/).*)',
};
