import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, newNonce, NONCE_HEADER, type PolicyInput } from './policy';
import shellScriptHashes from './shell-script-hashes.json';

const hashes = shellScriptHashes.map((hash) => `'${hash}'`).join(' ');

function directives(policy: string): string[] {
  return policy.split('; ');
}

function policyOf(input: Partial<PolicyInput>): string {
  return contentSecurityPolicy({
    nonce: 'n',
    dev: false,
    sentryDsn: undefined,
    storageEndpoint: undefined,
    storageBucket: undefined,
    yandexMaps: false,
    ...input,
  });
}

describe('contentSecurityPolicy', () => {
  it('lists the directives in order, with the nonce and the shell hashes', () => {
    const policy = policyOf({ nonce: 'abc==' });
    expect(directives(policy)).toEqual([
      "default-src 'self'",
      `script-src 'self' 'nonce-abc==' ${hashes}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api-eu.mixpanel.com",
      "font-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]);
  });

  it('allows eval only in development', () => {
    const dev = policyOf({ dev: true });
    const prod = policyOf({ dev: false });
    expect(directives(dev)[1]).toBe(`script-src 'self' 'nonce-n' ${hashes} 'unsafe-eval'`);
    expect(prod).not.toContain('unsafe-eval');
  });

  it('has no strict-dynamic and no data: in worker-src', () => {
    const policy = policyOf({ dev: true });
    expect(policy).not.toContain('strict-dynamic');
    expect(directives(policy).find((d) => d.startsWith('worker-src'))).not.toContain('data:');
  });

  it("adds the Sentry DSN's origin to connect-src, without key and path", () => {
    const policy = policyOf({ sentryDsn: 'https://k@o1.ingest.de.sentry.io/2' });
    expect(directives(policy)).toContain(
      "connect-src 'self' https://api-eu.mixpanel.com https://o1.ingest.de.sentry.io",
    );
  });

  it.each([
    ['empty', ''],
    ['undefined', undefined],
    ['unparsable', 'not a dsn'],
    ['not http(s)', 'ftp://k@o1.ingest.sentry.io/2'],
    ['javascript:', 'javascript:alert(1)'],
  ])('adds no origin for a %s DSN', (_name, sentryDsn) => {
    const policy = policyOf({ sentryDsn });
    expect(directives(policy)).toContain("connect-src 'self' https://api-eu.mixpanel.com");
  });

  it("adds the bucket's users folders on the storage origin to img-src only", () => {
    const policy = policyOf({
      storageEndpoint: 'http://localhost:8335',
      storageBucket: 'ai-fitting',
    });
    expect(directives(policy)).toContain(
      "img-src 'self' data: blob: http://localhost:8335/ai-fitting/keep/users/",
    );
    expect(directives(policy)).toContain("connect-src 'self' https://api-eu.mixpanel.com");
    expect(directives(policy)).toContain("default-src 'self'");
  });

  it('drops the storage address path and credentials', () => {
    const policy = policyOf({
      storageEndpoint: 'https://user:pass@s3.example.ru/other/x',
      storageBucket: 'my.bucket-1',
    });
    expect(directives(policy)).toContain(
      "img-src 'self' data: blob: https://s3.example.ru/my.bucket-1/keep/users/",
    );
    expect(policy).not.toContain('pass');
    expect(policy).not.toContain('other');
  });

  it.each([
    ['empty', ''],
    ['undefined', undefined],
    ['with a semicolon', 'AI;x'],
    ['with a space', 'a b'],
    ['upper case', 'AiFitting'],
    ['one character', 'a'],
    ['starting with a dash', '-ab'],
    ['ending with a dot', 'ab.'],
    ['with a slash', 'a/../b'],
    ['too long', 'a'.repeat(64)],
  ])('adds nothing for a bucket name %s', (_name, storageBucket) => {
    const policy = policyOf({ storageEndpoint: 'http://localhost:8335', storageBucket });
    expect(directives(policy)).toContain("img-src 'self' data: blob:");
    expect(policy).not.toContain('localhost');
  });

  it('adds nothing for a missing endpoint, whatever the bucket', () => {
    const policy = policyOf({ storageEndpoint: undefined, storageBucket: 'ai-fitting' });
    expect(directives(policy)).toContain("img-src 'self' data: blob:");
    expect(policy).not.toContain('ai-fitting');
  });

  it.each([
    ['empty', ''],
    ['undefined', undefined],
    ['unparsable', 'not a url'],
    ['not http(s)', 'ftp://s3.example.ru'],
    ['javascript:', 'javascript:alert(1)'],
  ])('adds no origin for a %s storage endpoint', (_name, storageEndpoint) => {
    const policy = policyOf({ storageEndpoint, storageBucket: 'ai-fitting' });
    expect(directives(policy)).toContain("img-src 'self' data: blob:");
  });
});

describe('contentSecurityPolicy with Yandex Maps (spec 0022 X16)', () => {
  const maps = 'https://api-maps.yandex.ru https://*.api-maps.yandex.ru';

  it("adds Yandex's origins and eval, and keeps every other directive", () => {
    const policy = policyOf({ nonce: 'abc==', yandexMaps: true });
    expect(directives(policy)).toEqual([
      "default-src 'self'",
      `script-src 'self' 'nonce-abc==' ${hashes} https://api-maps.yandex.ru/v3/ https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/ 'unsafe-eval'`,
      `style-src 'self' 'unsafe-inline' ${maps} https://yastatic.net`,
      `img-src 'self' data: blob: ${maps} https://*.maps.yandex.net https://yastatic.net`,
      `connect-src 'self' https://api-eu.mixpanel.com ${maps} https://*.maps.yandex.net`,
      "font-src 'self'",
      `worker-src 'self' blob: data: ${maps}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]);
  });

  it("allows only the map's folder of yastatic.net in script-src, none of it in worker-src", () => {
    const policy = directives(policyOf({ yandexMaps: true }));
    const scripts = policy.find((d) => d.startsWith('script-src'))?.split(' ') ?? [];
    expect(scripts.filter((source) => source.includes('yastatic'))).toEqual([
      'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/',
    ]);
    expect(policy.find((d) => d.startsWith('worker-src'))).not.toContain('yastatic');
  });

  it('has eval once in development', () => {
    const policy = policyOf({ dev: true, yandexMaps: true });
    expect(policy.match(/'unsafe-eval'/g)).toHaveLength(1);
  });

  it('keeps the storage and Sentry sources beside them', () => {
    const policy = policyOf({
      yandexMaps: true,
      sentryDsn: 'https://k@o1.ingest.de.sentry.io/2',
      storageEndpoint: 'http://localhost:8335',
      storageBucket: 'ai-fitting',
    });
    expect(directives(policy)).toContain(
      `img-src 'self' data: blob: http://localhost:8335/ai-fitting/keep/users/ ${maps} https://*.maps.yandex.net https://yastatic.net`,
    );
    expect(directives(policy)).toContain(
      `connect-src 'self' https://api-eu.mixpanel.com https://o1.ingest.de.sentry.io ${maps} https://*.maps.yandex.net`,
    );
  });

  it('adds nothing of Yandex without the flag', () => {
    expect(policyOf({ yandexMaps: false })).not.toContain('yandex');
  });
});

describe('newNonce', () => {
  it('is base64 of 16 bytes', () => {
    const nonce = newNonce();
    expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
    expect(Buffer.from(nonce, 'base64').toString('base64')).toBe(nonce);
  });

  it('differs on every call', () => {
    expect(new Set(Array.from({ length: 20 }, newNonce)).size).toBe(20);
  });
});

describe('NONCE_HEADER', () => {
  it('is x-nonce', () => {
    expect(NONCE_HEADER).toBe('x-nonce');
  });
});
