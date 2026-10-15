import { describe, expect, it } from 'vitest';

import { assertServerEnv, validateEnv } from './env.js';

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

  it('still accepts ADMIN_API_TOKEN with punctuation', () => {
    const token = 'a-b_'.repeat(10);

    expect(validateEnv({ ...valid, ADMIN_API_TOKEN: token }).ADMIN_API_TOKEN).toBe(token);
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
    ['a dollar sign', `${'a'.repeat(39)}$`],
    ['a double quote', `${'a'.repeat(39)}"`],
    ['a semicolon', `${'a'.repeat(39)};`],
    ['a hyphen', `${'a'.repeat(20)}-${'a'.repeat(19)}`],
    ['a backtick', `${'a'.repeat(39)}\``],
  ])('refuses PROXY_SECRET with %s, naming the variable but not the value', (_name, secret) => {
    const message = thrownMessage(() => validateEnv({ ...valid, PROXY_SECRET: secret }));

    expect(message).toMatch(/PROXY_SECRET/);
    expect(message).not.toContain(secret);
  });

  it('refuses an equal PROXY_SECRET and ADMIN_API_TOKEN, naming both but not the value', () => {
    const shared = 'sharedvalue0123456789abcdefxyz01';

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

  it('defaults PROXY_SECRET_NEXT to an empty string', () => {
    expect(validateEnv(valid).PROXY_SECRET_NEXT).toBe('');
  });

  it.each(['', 'a'.repeat(32), 'ab12'.repeat(16)])('accepts PROXY_SECRET_NEXT %j', (secret) => {
    expect(validateEnv({ ...valid, PROXY_SECRET_NEXT: secret }).PROXY_SECRET_NEXT).toBe(secret);
  });

  it.each([
    ['31 characters', 'a'.repeat(31)],
    ['a space inside', `${'a'.repeat(20)} ${'a'.repeat(19)}`],
    ['a trailing space', `${'a'.repeat(39)} `],
    ['a dollar sign', `${'a'.repeat(39)}$`],
    ['a double quote', `${'a'.repeat(39)}"`],
    ['a semicolon', `${'a'.repeat(39)};`],
    ['a hyphen', `${'a'.repeat(20)}-${'a'.repeat(19)}`],
  ])(
    'refuses PROXY_SECRET_NEXT with %s, naming the variable but not the value',
    (_name, secret) => {
      const message = thrownMessage(() => validateEnv({ ...valid, PROXY_SECRET_NEXT: secret }));

      expect(message).toMatch(/PROXY_SECRET_NEXT/);
      expect(message).not.toContain(secret);
    },
  );

  it('refuses PROXY_SECRET_NEXT equal to ADMIN_API_TOKEN, naming both but not the value', () => {
    const shared = 'sharedvalue0123456789abcdefxyz01';

    const message = thrownMessage(() =>
      validateEnv({ ...valid, PROXY_SECRET_NEXT: shared, ADMIN_API_TOKEN: shared }),
    );

    expect(message).toMatch(/PROXY_SECRET_NEXT: must differ from ADMIN_API_TOKEN/);
    expect(message).not.toContain(shared);
  });

  it('refuses PROXY_SECRET_NEXT equal to ADMIN_API_TOKEN even when PROXY_SECRET differs', () => {
    const shared = 'sharedvalue0123456789abcdefxyz01';

    expect(() =>
      validateEnv({
        ...valid,
        PROXY_SECRET: 'p'.repeat(32),
        PROXY_SECRET_NEXT: shared,
        ADMIN_API_TOKEN: shared,
      }),
    ).toThrow(/PROXY_SECRET_NEXT/);
  });

  it.each([
    ['PROXY_SECRET empty', '', 'n'.repeat(32), 'a'.repeat(32)],
    ['both set and different', 'p'.repeat(32), 'n'.repeat(32), 'a'.repeat(32)],
    ['both equal', 'p'.repeat(32), 'p'.repeat(32), 'a'.repeat(32)],
    ['NEXT set and the admin token empty', 'p'.repeat(32), 'n'.repeat(32), ''],
    ['NEXT empty', 'p'.repeat(32), '', 'a'.repeat(32)],
  ])('accepts PROXY_SECRET_NEXT with %s', (_name, proxy, next, admin) => {
    const env = validateEnv({
      ...valid,
      PROXY_SECRET: proxy,
      PROXY_SECRET_NEXT: next,
      ADMIN_API_TOKEN: admin,
    });

    expect(env.PROXY_SECRET).toBe(proxy);
    expect(env.PROXY_SECRET_NEXT).toBe(next);
  });

  it('accepts production with an empty PROXY_SECRET (the temporal-worker has none)', () => {
    const env = validateEnv({ ...valid, NODE_ENV: 'production', PROXY_SECRET: '' });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PROXY_SECRET).toBe('');
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

describe('assertServerEnv', () => {
  it('refuses production with an empty PROXY_SECRET, naming the variable', () => {
    expect(() => assertServerEnv({ NODE_ENV: 'production', PROXY_SECRET: '' })).toThrow(
      'Invalid environment: PROXY_SECRET: must be set in production',
    );
  });

  it('accepts production with a PROXY_SECRET', () => {
    expect(() =>
      assertServerEnv({ NODE_ENV: 'production', PROXY_SECRET: 'p'.repeat(32) }),
    ).not.toThrow();
  });

  it('still refuses production with an empty PROXY_SECRET when PROXY_SECRET_NEXT is set', () => {
    const env = validateEnv({
      ...valid,
      NODE_ENV: 'production',
      PROXY_SECRET: '',
      PROXY_SECRET_NEXT: 'n'.repeat(32),
    });

    expect(() => assertServerEnv(env)).toThrow(
      'Invalid environment: PROXY_SECRET: must be set in production',
    );
  });

  it.each(['development', 'test'] as const)('accepts %s with an empty PROXY_SECRET', (nodeEnv) => {
    expect(() => assertServerEnv({ NODE_ENV: nodeEnv, PROXY_SECRET: '' })).not.toThrow();
  });
});
