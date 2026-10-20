import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cursorPaginatedSchema, paginatedSchema } from './index';

const schema = paginatedSchema(z.object({ id: z.number() }));
const cursorSchema = cursorPaginatedSchema(z.object({ id: z.number() }));

describe('cursorPaginatedSchema', () => {
  it('parses a first batch and drops extra fields', () => {
    expect(
      cursorSchema.parse({
        items: [{ id: 1, extra: 'x' }],
        total: 7,
        nextCursor: 'abc',
        note: 1,
      }),
    ).toEqual({ items: [{ id: 1 }], total: 7, nextCursor: 'abc' });
  });

  it('accepts a null total (a batch after the first) and a null nextCursor (the last one)', () => {
    expect(cursorSchema.parse({ items: [], total: null, nextCursor: null })).toEqual({
      items: [],
      total: null,
      nextCursor: null,
    });
  });

  it.each([
    ['a missing total', { items: [], nextCursor: null }],
    ['a missing nextCursor', { items: [], total: 0 }],
    ['a non-array items', { items: {}, total: 0, nextCursor: null }],
    ['an invalid item', { items: [{ id: 'a' }], total: 1, nextCursor: null }],
    ['a string total', { items: [], total: '0', nextCursor: null }],
    ['a numeric nextCursor', { items: [], total: 0, nextCursor: 1 }],
  ])('refuses %s', (_name, body) => {
    expect(cursorSchema.safeParse(body).success).toBe(false);
  });
});

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
