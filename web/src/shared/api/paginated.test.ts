import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { paginatedSchema } from './index';

const schema = paginatedSchema(z.object({ id: z.number() }));

describe('paginatedSchema', () => {
  it('parses a page and drops extra fields', () => {
    expect(schema.parse({ items: [{ id: 1, extra: 'x' }], total: 7, note: 1 })).toEqual({
      items: [{ id: 1 }],
      total: 7,
    });
  });

  it.each([
    ['a missing total', { items: [] }],
    ['a non-array items', { items: {}, total: 0 }],
    ['an invalid item', { items: [{ id: 'a' }], total: 1 }],
    ['a string total', { items: [], total: '0' }],
  ])('refuses %s', (_name, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });
});
