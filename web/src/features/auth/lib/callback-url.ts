// Where a sign-in returns (spec 0013 plan §10): the page it started on, its path and query from
// the router, never from a query parameter (no open redirect). Every leading run of `/` and `\`
// becomes a single `/`, so the path cannot read as another host (`//evil.example`, `/\evil`).
// A `next=` or `callbackURL=` in the query stays part of the page's own query, nothing more.
export function callbackUrl(pathname: string, search: string): string {
  const path = `/${pathname.replace(/^[/\\]+/, '')}`;
  return search ? `${path}?${search}` : path;
}
