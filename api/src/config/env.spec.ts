import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.js';

const valid = {
  WEB_ORIGIN: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://u:p@db:5432/app',
  REDIS_URL: 'redis://redis:6379',
  TEMPORAL_ADDRESS: 'temporal:7233',
  MEDIA_BASE_URL: 'http://localhost:3001/media/',
};

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('validateEnv', () => {
  it('defaults ADMIN_API_TOKEN to an empty string', () => {
    expect(validateEnv(valid).ADMIN_API_TOKEN).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts ADMIN_API_TOKEN %j', (token) => {
    expect(validateEnv({ ...valid, ADMIN_API_TOKEN: token }).ADMIN_API_TOKEN).toBe(token);
  });

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a leading space', ` ${'a'.repeat(39)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a tab', `${'a'.repeat(39)}\t`],
  ])('refuses ADMIN_API_TOKEN with %s, naming the variable but not the value', (_name, token) => {
    const message = thrownMessage(() => validateEnv({ ...valid, ADMIN_API_TOKEN: token }));

    expect(message).toMatch(/ADMIN_API_TOKEN/);
    expect(message).not.toContain(token);
  });

  it.each(['http://localhost:3001/media/', 'https://example.ru/media/'])(
    'accepts MEDIA_BASE_URL %s',
    (url) => {
      expect(validateEnv({ ...valid, MEDIA_BASE_URL: url }).MEDIA_BASE_URL).toBe(url);
    },
  );

  it('refuses a missing MEDIA_BASE_URL, naming the variable', () => {
    const { MEDIA_BASE_URL: _omitted, ...without } = valid;

    expect(() => validateEnv(without)).toThrow(/MEDIA_BASE_URL/);
  });

  it.each(['ftp://example.ru/media/', 'not a url', ''])('refuses MEDIA_BASE_URL %j', (url) => {
    expect(() => validateEnv({ ...valid, MEDIA_BASE_URL: url })).toThrow(/MEDIA_BASE_URL/);
  });
});
