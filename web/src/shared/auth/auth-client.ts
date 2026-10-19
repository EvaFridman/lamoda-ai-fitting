import { createAuthClient } from 'better-auth/react';

// Better Auth's browser client (spec 0013 plan §10): the site's own /api/auth, which nginx passes
// to the api with its prefix (in development, the rewrite of next.config.ts). Its session hook reads
// /api/auth/get-session, which also extends the session: the api never does (N30). Its version is
// the api's, pinned exactly in both packages (N33). Only `better-auth/react`, never the server part.
export const authClient = createAuthClient({ basePath: '/api/auth' });
