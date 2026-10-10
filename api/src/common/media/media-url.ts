// The full address of an image key under MEDIA_BASE_URL (spec 0004 E8). Not a bare
// `new URL(key, base)`: the result must stay on the base's origin and under its path, so a key
// such as `//host/x` or `%2e%2e/x` cannot point elsewhere. The database already forbids such keys
// (spec 0002 C22), so one that escapes is a bug: it throws, and the request answers 500.
export function toMediaUrl(base: string, key: string): string {
  const root = new URL(base);
  // Without the trailing `/`, `new URL` would drop the base's last path segment.
  if (!root.pathname.endsWith('/')) root.pathname = `${root.pathname}/`;
  root.search = '';
  root.hash = '';

  const url = new URL(key, root);
  if (
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname) ||
    // An empty key, `.` or `./` would give the base itself.
    url.pathname === root.pathname ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`Image key escapes MEDIA_BASE_URL: ${JSON.stringify(key)}`);
  }
  return url.href;
}
