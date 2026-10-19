// Set in this tab just before the page leaves for Google and taken once it is back (spec 0013 plan
// §10): only such a page counts `Signed In` and reports a failed sign-in (N54). A link with an
// `error` from somewhere else, or a session from another tab, finds no flag. The key does not start
// with `mp_` or `__mp`, which the analytics client clears (0008 J32).
const KEY = 'sign-in-started';

// A sign-in abandoned at Google leaves its flag; after this long it counts as none (N55).
export const SIGN_IN_FLAG_MS = 10 * 60 * 1000;

// Best effort: blocked storage loses the flag, and with it only the event and the report.
export function markSignInStarted(): void {
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage blocked
  }
}

// Whether a sign-in was started in this tab within the last 10 minutes; the flag is gone after the
// first call.
export function takeSignInStarted(): boolean {
  try {
    const startedAt = Number(window.sessionStorage.getItem(KEY));
    window.sessionStorage.removeItem(KEY);
    const age = Date.now() - startedAt;
    return startedAt > 0 && age >= 0 && age <= SIGN_IN_FLAG_MS;
  } catch {
    return false;
  }
}
