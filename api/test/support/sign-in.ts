import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { makeSignature } from 'better-auth/crypto';

import type { Auth } from '../../src/auth/auth.js';
import { AUTH } from '../../src/auth/auth.module.js';

export interface SignedIn {
  userId: string;
  sessionId: string;
  // The `Cookie` header of the signed-in browser: Better Auth's signed session token.
  cookie: string;
}

// A user with a session, created through Better Auth's internal adapter (spec 0013 plan §11), for
// e2e that need a signed-in user without walking the redirect flow (auth.e2e-spec.ts walks it).
// Each call makes a new user, with a unique email unless one is given.
export async function signIn(
  app: INestApplication,
  user: { email?: string; name?: string } = {},
): Promise<SignedIn> {
  const context = await app.get<Auth>(AUTH).$context;
  const created = await context.internalAdapter.createUser(
    {
      email: user.email ?? `user-${randomUUID()}@example.com`,
      name: user.name ?? 'Анна',
      emailVerified: true,
    },
    { method: 'test' },
  );
  const session = await context.internalAdapter.createSession(created.id);
  const token = session.token;
  const signed = `${token}.${await makeSignature(token, context.secret)}`;
  return {
    userId: created.id,
    sessionId: session.id,
    cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`,
  };
}
