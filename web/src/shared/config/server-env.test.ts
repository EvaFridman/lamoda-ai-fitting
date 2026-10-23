// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const BASE = {
  API_URL: 'http://api:3000',
  SITE_URL: 'https://lamoda-ai-fitting.ru',
  REDIS_CACHE_URL: 'redis://redis-cache:6379',
};

async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('PROXY_SECRET', undefined);
  for (const [key, value] of Object.entries({ ...BASE, ...env })) vi.stubEnv(key, value);
  const { getServerEnv } = await import('./server-env');
  return getServerEnv;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getServerEnv API_URL', () => {
  it.each(['foo://api', 'ftp://api'])('rejects %s', async (url) => {
    const getServerEnv = await load({ API_URL: url });
    expect(() => getServerEnv()).toThrow(/API_URL/);
  });

  it.each(['https://api', 'http://api:3000'])('accepts %s', async (url) => {
    const getServerEnv = await load({ API_URL: url });
    expect(getServerEnv().API_URL).toBe(url);
  });
});

describe('getServerEnv SITE_URL', () => {
  it('is required', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('PROXY_SECRET', undefined);
    vi.stubEnv('SITE_URL', undefined);
    vi.stubEnv('API_URL', BASE.API_URL);
    vi.stubEnv('REDIS_CACHE_URL', BASE.REDIS_CACHE_URL);
    const { getServerEnv } = await import('./server-env');
    expect(() => getServerEnv()).toThrow(/SITE_URL/);
  });

  it.each(['foo://site', 'ftp://site', 'lamoda-ai-fitting.ru', ''])('rejects %j', async (url) => {
    const getServerEnv = await load({ SITE_URL: url });
    expect(() => getServerEnv()).toThrow(/SITE_URL/);
  });

  it.each(['https://lamoda-ai-fitting.ru', 'http://localhost:3000'])('accepts %s', async (url) => {
    const getServerEnv = await load({ SITE_URL: url });
    expect(getServerEnv().SITE_URL).toBe(url);
  });
});

describe('getServerEnv REDIS_CACHE_URL', () => {
  it.each(['http://redis-cache:6379', 'redis-cache:6379', ''])('rejects %j', async (url) => {
    const getServerEnv = await load({ REDIS_CACHE_URL: url });
    expect(() => getServerEnv()).toThrow(/REDIS_CACHE_URL/);
  });

  it.each(['redis://redis-cache:6379', 'rediss://cache.example:6380'])(
    'accepts %s',
    async (url) => {
      const getServerEnv = await load({ REDIS_CACHE_URL: url });
      expect(getServerEnv().REDIS_CACHE_URL).toBe(url);
    },
  );
});

describe('getServerEnv PAGE_CACHE_REVALIDATE_SECONDS', () => {
  it('defaults to 60', async () => {
    const getServerEnv = await load({});
    expect(getServerEnv().PAGE_CACHE_REVALIDATE_SECONDS).toBe(60);
  });

  it.each([
    ['1', 1],
    ['3600', 3600],
    ['120', 120],
  ])('accepts %s', async (value, expected) => {
    const getServerEnv = await load({ PAGE_CACHE_REVALIDATE_SECONDS: value });
    expect(getServerEnv().PAGE_CACHE_REVALIDATE_SECONDS).toBe(expected);
  });

  it.each(['0', '3601', '-5', '1.5', 'abc'])('rejects %s', async (value) => {
    const getServerEnv = await load({ PAGE_CACHE_REVALIDATE_SECONDS: value });
    expect(() => getServerEnv()).toThrow(/PAGE_CACHE_REVALIDATE_SECONDS/);
  });
});

describe('getServerEnv S3_PUBLIC_ENDPOINT', () => {
  it('defaults to empty', async () => {
    const getServerEnv = await load({});
    expect(getServerEnv().S3_PUBLIC_ENDPOINT).toBe('');
  });

  it.each(['', 'http://localhost:8333', 'https://s3.example.ru'])('accepts %j', async (url) => {
    const getServerEnv = await load({ S3_PUBLIC_ENDPOINT: url });
    expect(getServerEnv().S3_PUBLIC_ENDPOINT).toBe(url);
  });

  it.each(['ftp://s3', 'localhost:8333', 'not a url'])('rejects %j', async (url) => {
    const getServerEnv = await load({ S3_PUBLIC_ENDPOINT: url });
    expect(() => getServerEnv()).toThrow(/S3_PUBLIC_ENDPOINT/);
  });
});

describe('getServerEnv S3_BUCKET', () => {
  it('defaults to empty', async () => {
    const getServerEnv = await load({});
    expect(getServerEnv().S3_BUCKET).toBe('');
  });

  it.each(['', 'ai-fitting', 'my.bucket-1'])('accepts %j', async (name) => {
    const getServerEnv = await load({ S3_BUCKET: name });
    expect(getServerEnv().S3_BUCKET).toBe(name);
  });

  it.each(['AI;x', 'a b', 'Upper', 'a', '-ab', 'ab-', 'a/b'])('rejects %j', async (name) => {
    const getServerEnv = await load({ S3_BUCKET: name });
    expect(() => getServerEnv()).toThrow(/S3_BUCKET/);
  });
});

describe('getServerEnv PROXY_SECRET', () => {
  it('defaults to empty when absent', async () => {
    const getServerEnv = await load({});
    expect(getServerEnv().PROXY_SECRET).toBe('');
  });

  it('accepts an empty value', async () => {
    const getServerEnv = await load({ PROXY_SECRET: '' });
    expect(getServerEnv().PROXY_SECRET).toBe('');
  });

  it('accepts 32 or more characters', async () => {
    const secret = 'k'.repeat(40);
    const getServerEnv = await load({ PROXY_SECRET: secret });
    expect(getServerEnv().PROXY_SECRET).toBe(secret);
  });

  it('rejects a short secret', async () => {
    const getServerEnv = await load({ PROXY_SECRET: 'k'.repeat(31) });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
  });

  it('rejects a secret with spaces', async () => {
    const getServerEnv = await load({ PROXY_SECRET: `${'k'.repeat(20)} ${'k'.repeat(20)}` });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
  });

  it.each([
    ['a dollar sign', '$'],
    ['a double quote', '"'],
    ['a semicolon', ';'],
    ['a hyphen', '-'],
    ['a backtick', '`'],
    ['a tab', '\t'],
  ])('rejects a secret with %s, without printing it', async (_name, char) => {
    const secret = `${'k'.repeat(20)}${char}${'k'.repeat(20)}`;
    const getServerEnv = await load({ PROXY_SECRET: secret });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
    expect(() => getServerEnv()).not.toThrow(secret);
  });

  it('rejects a blank value', async () => {
    const getServerEnv = await load({ PROXY_SECRET: ' '.repeat(40) });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
  });
});

describe('getServerEnv PROXY_SECRET in production', () => {
  it('rejects an absent secret', async () => {
    const getServerEnv = await load({ NODE_ENV: 'production' });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET: must be set in production/);
  });

  it('rejects an empty secret', async () => {
    const getServerEnv = await load({ NODE_ENV: 'production', PROXY_SECRET: '' });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET: must be set in production/);
  });

  it('accepts a valid secret', async () => {
    const secret = 'k'.repeat(40);
    const getServerEnv = await load({ NODE_ENV: 'production', PROXY_SECRET: secret });
    expect(getServerEnv().PROXY_SECRET).toBe(secret);
  });

  it.each(['development', 'test'])('accepts an empty secret in %s', async (nodeEnv) => {
    const getServerEnv = await load({ NODE_ENV: nodeEnv, PROXY_SECRET: '' });
    expect(getServerEnv().PROXY_SECRET).toBe('');
  });

  it('never puts a secret value into the error message', async () => {
    const secret = 'k'.repeat(20) + ' ' + 'k'.repeat(20);
    const getServerEnv = await load({ NODE_ENV: 'production', PROXY_SECRET: secret });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
    expect(() => getServerEnv()).not.toThrow(secret);
  });
});
