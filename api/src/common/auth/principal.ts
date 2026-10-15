// Who sends a request (spec 0006 F4): the admin, by the X-Admin-Token header, or anyone else. The
// auth spec adds a signed-in user here.
export type Principal = { readonly kind: 'admin' } | { readonly kind: 'anonymous' };

export const ADMIN: Principal = { kind: 'admin' };
export const ANONYMOUS: Principal = { kind: 'anonymous' };
