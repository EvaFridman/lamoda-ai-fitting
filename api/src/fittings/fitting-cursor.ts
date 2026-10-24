import { z } from 'zod';

// The keyset cursor of the fitting history (spec 0019 plan §5), the product list's form
// (products/listing/product-cursor.ts): base64url of JSON `{ k, id }`, the `created_at` and the id
// of a batch's last fitting, newest first. Not signed: it only says where to continue.

// A whole cursor is about 90 characters; a longer one is refused before it is decoded.
const MAX_CURSOR_LENGTH = 256;
// PostgreSQL has no year 0: such a key would fail in the query as a 500, not 400.
const FIRST_YEAR = /^(?!0000)/;

const CURSOR_SCHEMA = z.strictObject({
  k: z.iso.datetime({ precision: 3 }).regex(FIRST_YEAR),
  id: z.uuid(),
});

export interface FittingCursor {
  createdAt: Date;
  id: string;
}

export function encodeFittingCursor(row: FittingCursor): string {
  return Buffer.from(JSON.stringify({ k: row.createdAt.toISOString(), id: row.id })).toString(
    'base64url',
  );
}

// The cursor, or null when the value is not one.
export function decodeFittingCursor(value: unknown): FittingCursor | null {
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = CURSOR_SCHEMA.safeParse(json);
  return parsed.success ? { createdAt: new Date(parsed.data.k), id: parsed.data.id } : null;
}
