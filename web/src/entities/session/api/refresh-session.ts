import { authClient, callAuth } from '@/shared/auth';

// Reads the session past Better Auth's signed copy (5 minutes, spec 0013 N18), which writes the
// copy again from the database, then tells `useSession` to read it: so the header shows a name
// changed on "Мои данные" at once (spec 0017 plan §4, AC8). A `get-session` read does not signal
// the session hook by itself. Throws an `ApiError`, already reported.
export async function refreshSession(): Promise<void> {
  await callAuth('get-session', 'GET', (fetchOptions) =>
    authClient.getSession({ query: { disableCookieCache: true }, fetchOptions }),
  );
  authClient.$store.notify('$sessionSignal');
}
