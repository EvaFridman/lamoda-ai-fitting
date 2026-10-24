import { describe, expect, it } from 'vitest';

import { decodeFittingCursor, encodeFittingCursor } from './fitting-cursor.js';

const ID = '0199aaaa-0000-7000-8000-0000000000a1';

function cursorOf(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('the fitting cursor', () => {
  it('round-trips a row’s moment and id', () => {
    const createdAt = new Date('2026-10-24T09:08:07.123Z');

    const decoded = decodeFittingCursor(encodeFittingCursor({ createdAt, id: ID }));

    expect(decoded).toEqual({ createdAt, id: ID });
  });

  it('is URL-safe', () => {
    const cursor = encodeFittingCursor({ createdAt: new Date('2026-10-24T09:08:07.123Z'), id: ID });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['a number', 12],
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['text that is not base64url', 'not a cursor!'],
    ['base64url of text that is not JSON', Buffer.from('hello').toString('base64url')],
    ['an array', cursorOf([ID])],
    ['a missing id', cursorOf({ k: '2026-10-24T09:08:07.123Z' })],
    ['a missing key', cursorOf({ id: ID })],
    ['an id that is not a uuid', cursorOf({ k: '2026-10-24T09:08:07.123Z', id: 'x' })],
    ['a key that is not a date', cursorOf({ k: 'yesterday', id: ID })],
    ['a date without milliseconds', cursorOf({ k: '2026-10-24T09:08:07Z', id: ID })],
    ['year 0', cursorOf({ k: '0000-01-01T00:00:00.000Z', id: ID })],
    ['an extra field', cursorOf({ k: '2026-10-24T09:08:07.123Z', id: ID, extra: 1 })],
    ['a value over 256 characters', 'a'.repeat(257)],
  ])('refuses %s', (_name, value) => {
    expect(decodeFittingCursor(value)).toBeNull();
  });
});
