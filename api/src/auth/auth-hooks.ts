import { isPersonName, normalizeEmail } from '../common/validation/rules.js';

// What Better Auth's database hooks change before it writes a row (spec 0013 plan §3). Each takes
// the row in Better Auth's field names (`name`, not `firstName`) and returns only the fields it
// changes: Better Auth merges them over the row. A field set to `undefined` is not written, which
// is how the fields we have no column for stay out (Prisma refuses an unknown one).

// Google's token fields: the api never calls Google after sign-in, so none is kept.
const TOKEN_FIELDS = [
  'accessToken',
  'refreshToken',
  'idToken',
  'accessTokenExpiresAt',
  'refreshTokenExpiresAt',
  'scope',
] as const;

// The email lower-cased and in NFC (the `users_email_check` wants it), and the given name only when
// it passes the name rule of a user's first name, else null (N5). No avatar (N6). A field the
// write leaves out stays out.
export function userFields(user: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = { image: undefined };
  if ('email' in user) fields.email = normalizeEmail(user.email);
  if ('name' in user) fields.name = personName(user.name);
  return fields;
}

export function personName(value: unknown): string | null {
  return isPersonName(value) ? value : null;
}

export function accountFields(): Record<string, unknown> {
  return Object.fromEntries(TOKEN_FIELDS.map((field) => [field, null]));
}

// No IP address (tracking is off and there is no column) and no User-Agent: nothing reads it, and
// with the user id it fingerprints a browser (spec 0013 N34). Its column stays empty until a later
// release drops it.
export function sessionFields(): Record<string, unknown> {
  return { ipAddress: undefined, userAgent: undefined };
}
