// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const BASE = { API_URL: 'http://api:3000', REDIS_URL: 'redis://redis:6379' };

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

  it('rejects a blank value', async () => {
    const getServerEnv = await load({ PROXY_SECRET: ' '.repeat(40) });
    expect(() => getServerEnv()).toThrow(/PROXY_SECRET/);
  });
});
