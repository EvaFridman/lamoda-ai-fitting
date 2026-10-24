import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseFittingFinished, userRoom } from './fitting-events.js';

describe('parseFittingFinished', () => {
  const valid = () => ({
    userId: randomUUID(),
    generationId: randomUUID(),
    kind: 'single',
    status: 'completed',
  });
  const parse = (value: unknown) => parseFittingFinished(JSON.stringify(value));

  it.each([
    ['single', 'completed'],
    ['single', 'failed'],
    ['look', 'completed'],
    ['look', 'failed'],
  ])('accepts a %s fitting that %s', (kind, status) => {
    const message = { ...valid(), kind, status };

    expect(parse(message)).toEqual(message);
  });

  it('refuses broken JSON, a non-object and an empty message', () => {
    expect(parseFittingFinished('{not json')).toBeNull();
    expect(parseFittingFinished('')).toBeNull();
    expect(parseFittingFinished('null')).toBeNull();
    expect(parseFittingFinished('[]')).toBeNull();
    expect(parseFittingFinished('"text"')).toBeNull();
  });

  it('refuses an extra field', () => {
    expect(parse({ ...valid(), imageUrl: 'https://example.com/x' })).toBeNull();
  });

  it.each(['userId', 'generationId', 'kind', 'status'])('refuses a message without %s', (field) => {
    const message: Record<string, unknown> = valid();
    delete message[field];

    expect(parse(message)).toBeNull();
  });

  it('refuses an id that is not a uuid', () => {
    expect(parse({ ...valid(), userId: 'user-1' })).toBeNull();
    expect(parse({ ...valid(), generationId: '123' })).toBeNull();
  });

  it('refuses a kind or a status outside the enums', () => {
    expect(parse({ ...valid(), kind: 'outfit' })).toBeNull();
    expect(parse({ ...valid(), status: 'processing' })).toBeNull();
    expect(parse({ ...valid(), status: 'pending' })).toBeNull();
  });
});

describe('userRoom', () => {
  it('names the room after the user', () => {
    expect(userRoom('abc')).toBe('user:abc');
  });
});
