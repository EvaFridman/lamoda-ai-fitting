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

  it('defaults PROXY_SECRET to an empty string', () => {
    expect(validateEnv(valid).PROXY_SECRET).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts PROXY_SECRET %j', (secret) => {
    expect(validateEnv({ ...valid, PROXY_SECRET: secret }).PROXY_SECRET).toBe(secret);
  });

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a leading space', ` ${'a'.repeat(39)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a tab', `${'a'.repeat(39)}\t`],
  ])('refuses PROXY_SECRET with %s, naming the variable but not the value', (_name, secret) => {
    const message = thrownMessage(() => validateEnv({ ...valid, PROXY_SECRET: secret }));

    expect(message).toMatch(/PROXY_SECRET/);
    expect(message).not.toContain(secret);
  });

  it('refuses an equal PROXY_SECRET and ADMIN_API_TOKEN, naming both but not the value', () => {
    const shared = 'shared-value-0123456789abcdef-xyz';

    const message = thrownMessage(() =>
      validateEnv({ ...valid, PROXY_SECRET: shared, ADMIN_API_TOKEN: shared }),
    );

    expect(message).toMatch(/PROXY_SECRET/);
    expect(message).toMatch(/ADMIN_API_TOKEN/);
    expect(message).not.toContain(shared);
  });

  it.each([
    ['both empty', '', ''],
    ['the proxy secret set and the admin token empty', 'p'.repeat(32), ''],
    ['the admin token set and the proxy secret empty', '', 'a'.repeat(32)],
    ['different values', 'p'.repeat(32), 'a'.repeat(32)],
  ])('accepts %s', (_name, proxy, admin) => {
    const env = validateEnv({ ...valid, PROXY_SECRET: proxy, ADMIN_API_TOKEN: admin });

    expect(env.PROXY_SECRET).toBe(proxy);
    expect(env.ADMIN_API_TOKEN).toBe(admin);
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
