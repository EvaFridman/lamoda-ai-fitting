import type { Response } from 'express';

import { UnauthorizedError } from '../common/errors/app.exception.js';
import type { AuthCookie } from './me.service.js';

// Better Auth's cookies of the browser, read when needed (MeService.sessionCookies).
export type SessionCookies = () => Promise<AuthCookie[]>;

// A route of the signed-in user's own data (spec 0013 N31, N38): the service's 401 means the user
// is gone, so the browser is signed out with it, and neither its cached session copy nor the token
// outlives the account. Other failures keep the cookies.
export async function signOutWhenGone<T>(
  res: Response,
  cookies: SessionCookies,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await expireSessionCookies(res, cookies);
    }
    throw error;
  }
}

// A handler that outlived REQUEST_TIMEOUT_MS has had its 503 sent already: nothing to set then.
export async function expireSessionCookies(res: Response, cookies: SessionCookies): Promise<void> {
  if (res.headersSent) return;
  for (const { name, attributes } of await cookies()) {
    res.clearCookie(name, {
      path: attributes.path,
      domain: attributes.domain,
      secure: attributes.secure,
      // Express's types take lower case only (its `cookie` lower-cases the value either way).
      sameSite: attributes.sameSite?.toLowerCase() as
        Lowercase<NonNullable<AuthCookie['attributes']['sameSite']>> | undefined,
      httpOnly: true,
    });
  }
}
