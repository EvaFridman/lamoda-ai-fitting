import type { NextFunction, Request, Response } from 'express';

// The routes of Better Auth that answer (N25): sign-in with Google, the session, signing out and
// signing out everywhere (N18); `ok` and `error` are its health check and the page a failed sign-in
// lands on. Anything else answers 404 before Better Auth sees it: changing the user (only the api's
// own routes do), linking or listing accounts, listing sessions (it answers every session's token),
// Google's tokens (never kept), email and password, and whatever a plugin or an update adds. A list
// of what answers, not of what does not: Better Auth's own `disabledPaths` matches exact paths, so
// a route with a parameter (`/reset-password/:token`) slips through it.
export const AUTH_ROUTES: ReadonlySet<string> = new Set(
  [
    '/sign-in/social',
    '/callback/google',
    '/get-session',
    '/sign-out',
    '/revoke-sessions',
    '/ok',
    '/error',
  ].map((route) => `/api/auth${route}`),
);

export const AUTH_NOT_FOUND = { code: 'NOT_FOUND', message: 'Not found' } as const;

export function authRoutes(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (AUTH_ROUTES.has(routedPath(req))) {
      next();
      return;
    }
    res.status(404).json(AUTH_NOT_FOUND);
  };
}

// The path as Better Auth routes it: it parses the address with WHATWG URL, which resolves `..` and
// `%2e%2e`; nginx passes such a path as sent. Compared exactly, as its router does (a trailing
// slash or another letter case is not the same route).
function routedPath(req: Request): string {
  return new URL(req.originalUrl, 'http://localhost').pathname;
}
