// Who sends a request: a signed-in user, by the session cookie (spec 0013 plan §4), or anyone else.
export type Principal =
  | { readonly kind: 'user'; readonly userId: string; readonly sessionId: string }
  | { readonly kind: 'anonymous' };

export const ANONYMOUS: Principal = { kind: 'anonymous' };
