import { authClient, callAuth } from '@/shared/auth';

// The provider id of Google in the api, the fake provider's too (spec 0013 N14).
const GOOGLE = 'google';

// Starts the sign-in: Better Auth answers Google's address and its client opens it, so the page
// leaves for Google and comes back to `callbackURL` signed in (AC1), or, when the sign-in fails
// there, to the same page with the failure's code in its query (N54). Throws an `ApiError`.
export async function signInWithGoogle(callbackURL: string): Promise<void> {
  await callAuth('sign-in/social', 'POST', (fetchOptions) =>
    authClient.signIn.social({
      provider: GOOGLE,
      callbackURL,
      errorCallbackURL: callbackURL,
      fetchOptions,
    }),
  );
}

// "Выйти": ends this browser's session (AC4). The client reads the session again after it, so the
// header shows the visitor signed out.
export async function signOut(): Promise<void> {
  await callAuth('sign-out', 'POST', (fetchOptions) => authClient.signOut({ fetchOptions }));
}

// "Выйти со всех устройств": ends every session of the user, then this browser's cookies go too.
// Other browsers keep their copy of the session for up to 5 minutes (N18). A 401 means this
// browser's session is already gone, ended from another browser and still in its copy here: the
// cookies go all the same.
export async function signOutEverywhere(): Promise<void> {
  await callAuth(
    'revoke-sessions',
    'POST',
    (fetchOptions) => authClient.revokeSessions({ fetchOptions }),
    { acceptStatus: 401 },
  );
  await signOut();
}
