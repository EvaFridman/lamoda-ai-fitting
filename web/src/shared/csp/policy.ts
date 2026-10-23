import shellScriptHashes from './shell-script-hashes.json';

// The request header that carries the nonce from `proxy.ts` to the page's server components.
// `proxy.ts` sets it on every page request, replacing one the client sent.
export const NONCE_HEADER = 'x-nonce';

// Mixpanel's EU endpoint (`client.ts`'s `api_host`, spec 0008 J12). The SDK and its recorder are
// bundled, so no script origin is needed.
const MIXPANEL_ORIGIN = 'https://api-eu.mixpanel.com';

export interface PolicyInput {
  nonce: string;
  // `next dev`: React uses `eval` there to rebuild server error stacks.
  dev: boolean;
  // The browser's Sentry DSN; its origin is where the SDK sends events. Empty: Sentry is off.
  sentryDsn: string | undefined;
  // The storage's address in the browser (`S3_PUBLIC_ENDPOINT`) and the app's bucket (`S3_BUCKET`):
  // signed links of users' photos are `<origin>/<bucket>/keep/users/…` (path-style, spec 0011).
  // Either empty: no image from the storage loads.
  storageEndpoint: string | undefined;
  storageBucket: string | undefined;
}

/** A fresh nonce for one request: 16 random bytes in base64. */
export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

/**
 * web's Content Security Policy for one page request (spec 0014 plan §5, O112). Scripts: our own
 * origin, since the static shell `cacheComponents` prerenders carries Next's script tags without a
 * nonce; the nonce, for what Next streams per request and the JSON-LD; and the hashes of React's
 * inline scripts in that shell (`check-web-shells.mjs` fails a build with any other). No
 * 'strict-dynamic': it would drop 'self' and the shell's scripts with it. Styles allow inline:
 * Next and Base UI set style attributes. The recorder runs in a `blob:` worker (O45). Images also
 * load from the users' folders of our bucket, where a user's photo is a signed link (spec 0019): a
 * path, not the whole origin, which the storage shares with every other bucket of its host.
 */
export function contentSecurityPolicy({
  nonce,
  dev,
  sentryDsn,
  storageEndpoint,
  storageBucket,
}: PolicyInput): string {
  const sentry = httpOrigin(sentryDsn);
  const storageOrigin = httpOrigin(storageEndpoint);
  // A bucket name is lower-case letters, digits, dots and dashes (S3's rule, as the api checks it):
  // nothing that could end the source or the directive.
  const storage =
    storageOrigin && storageBucket && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(storageBucket)
      ? `${storageOrigin}/${storageBucket}/keep/users/`
      : undefined;
  const directives = [
    "default-src 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      ...shellScriptHashes.map((hash) => `'${hash}'`),
      ...(dev ? ["'unsafe-eval'"] : []),
    ].join(' '),
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...(storage ? [storage] : [])].join(' '),
    ["connect-src 'self'", MIXPANEL_ORIGIN, ...(sentry ? [sentry] : [])].join(' '),
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return directives.join('; ');
}

/**
 * The origin of an http(s) address, without its key and path (a Sentry DSN
 * `https://key@o1.ingest.de.sentry.io/2` → `https://o1.ingest.de.sentry.io`); none for anything else.
 */
function httpOrigin(address: string | undefined): string | undefined {
  if (!address) return undefined;
  try {
    const { protocol, origin } = new URL(address);
    return protocol === 'https:' || protocol === 'http:' ? origin : undefined;
  } catch {
    return undefined;
  }
}
