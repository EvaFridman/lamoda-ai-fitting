import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { genericOAuth } from 'better-auth/plugins';

import { loggable } from '../common/filters/app-exception.filter.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { accountFields, sessionFields, userFields } from './auth-hooks.js';

export type AuthEnv = Pick<
  Env,
  | 'WEB_ORIGIN'
  | 'BETTER_AUTH_SECRET'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'AUTH_FAKE_OIDC_URL'
  | 'AUTH_FAKE_OIDC_PUBLIC_URL'
>;

export interface AuthLogger {
  debug(fields: object, message: string): void;
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

// The provider id either way, so the callback is always /api/auth/callback/google.
const GOOGLE = 'google';
const DAY_SECONDS = 24 * 60 * 60;

// The start of every cookie name Better Auth sets; on https each name also gets `__Secure-`.
export const AUTH_COOKIE_PREFIX = 'lamoda';
// The session cookie: the request context reads it on every route but /api/auth
// (session-reader.ts); swagger.ts documents it.
export const SESSION_COOKIE = `${AUTH_COOKIE_PREFIX}.session_token`;

// Sign-in with Google (spec 0013 plan §3). Mounted at /api/auth by createHttpApp(), which lets
// only the routes of auth-routes.ts reach it (N25); its answers keep Better Auth's
// `{ code, message }` (N17).
export function createAuth(env: AuthEnv, prisma: PrismaClient, logger: AuthLogger) {
  return betterAuth({
    // The site's origin: the browser reaches the api at /api/auth through nginx (or web's
    // rewrite locally), so every address Better Auth builds, the callback's too, is on the site.
    baseURL: env.WEB_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: { fields: { name: 'firstName' } },
    // 30 days, extended by use at most once a day (N4); a signed copy in a cookie spares the
    // database read for 5 minutes (N18).
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    ...(env.AUTH_FAKE_OIDC_URL === '' ? { socialProviders: { google: google(env) } } : {}),
    plugins: env.AUTH_FAKE_OIDC_URL === '' ? [] : [fakeGoogle(env)],
    databaseHooks: {
      user: {
        create: { before: (user) => Promise.resolve({ data: userFields(user) }) },
        update: { before: (user) => Promise.resolve({ data: userFields(user) }) },
      },
      account: {
        create: { before: () => Promise.resolve({ data: accountFields() }) },
        update: { before: () => Promise.resolve({ data: accountFields() }) },
      },
      session: {
        create: { before: () => Promise.resolve({ data: sessionFields() }) },
      },
    },
    // Its counter and its IP tracking read X-Forwarded-For without the proxy secret (spec 0006
    // F13): authThrottle counts by the request context's address instead.
    rateLimit: { enabled: false },
    // Its own errors still answer `{ code, message }`; anything else (a database error) is thrown on
    // to authErrorHandler (mount-auth.ts). Otherwise better-call prints it whole with
    // console.error, the session token and the user's data too, and answers an empty 500.
    onAPIError: { throw: true },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: new URL(env.WEB_ORIGIN).protocol === 'https:',
      ipAddress: { disableIpTracking: true },
      // The database's uuidv7() makes every id (N16). No schema check: it wants `users.image` and
      // `sessions.ip_address`, which we leave out (N6, plan §2; the hooks never write them). A
      // schema that drifts after an update fails the auth e2e instead.
      database: { generateId: 'uuid', validateSchema: false },
    },
    // An error it logs can be Prisma's, whose message holds the row: loggable() keeps codes and
    // stacks without it, as the error filter does. A few of its calls pass the error itself as the
    // message.
    logger: {
      log: (level, message: unknown, ...args: unknown[]) => {
        const fields = { args: args.map((arg) => loggable(arg)) };
        if (typeof message === 'string') {
          logger[level](fields, message);
        } else {
          logger[level]({ ...fields, err: loggable(message) }, 'Better Auth error');
        }
      },
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions);
}

export type Auth = ReturnType<typeof createAuth>;

function google(env: AuthEnv) {
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    prompt: 'select_account' as const,
    // Only the redirect flow: signing in with a Google ID token sent by the page is One Tap, left
    // to the backlog (N2).
    disableIdTokenSignIn: true,
    // The given name, not the full one; the user hook drops it unless it passes the name rule (N5).
    mapProfileToUser: (profile: { given_name?: string }) => ({ name: profile.given_name }),
  };
}

// The fake provider (N14, api/scripts/fake-oidc.mjs) under Google's provider id. Explicit
// endpoints: the browser opens the login page at the public address, the api calls the token and
// userinfo endpoints at the server address, so one discovery document cannot serve both.
function fakeGoogle(env: AuthEnv) {
  return genericOAuth({
    config: [
      {
        providerId: GOOGLE,
        clientId: 'fake-google',
        clientSecret: 'fake-google',
        authorizationUrl: new URL('/authorize', env.AUTH_FAKE_OIDC_PUBLIC_URL).href,
        tokenUrl: new URL('/token', env.AUTH_FAKE_OIDC_URL).href,
        userInfoUrl: new URL('/userinfo', env.AUTH_FAKE_OIDC_URL).href,
        scopes: ['openid', 'email', 'profile'],
        prompt: 'select_account',
        // The account is the provider's `sub`, as for Google.
        accountSubject: ({ profile }) => String(profile.sub ?? ''),
        mapProfileToUser: (profile) => ({
          name: typeof profile.given_name === 'string' ? profile.given_name : undefined,
        }),
      },
    ],
  });
}
