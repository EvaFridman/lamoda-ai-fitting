// A failed sign-in comes back to its page with Better Auth's `error` code and, sometimes,
// `error_description` added to the query (spec 0013 N54). Both are dropped from the address once
// read, and never sent on as the next sign-in's return address.
const ERROR_PARAMS = ['error', 'error_description'];

// Better Auth's codes are letters, digits and underscores; anything else came from someone else's
// link and is not carried to Sentry as it is.
const CODE = /^[A-Za-z0-9_]{1,64}$/;

// The failure's code, `unknown` for one that is not a code, or null without one.
export function signInErrorCode(searchParams: URLSearchParams): string | null {
  const code = searchParams.get('error');
  if (code === null) return null;
  return CODE.test(code) ? code : 'unknown';
}

export function withoutSignInError(searchParams: URLSearchParams): URLSearchParams {
  const rest = new URLSearchParams(searchParams);
  for (const name of ERROR_PARAMS) rest.delete(name);
  return rest;
}

// A failure other than the visitor's refusal, for Sentry: one group, the code in the message.
export function signInRedirectError(code: string): Error {
  const error = new Error(`sign-in came back with ${code}`);
  error.name = 'SignInFailed';
  return error;
}
