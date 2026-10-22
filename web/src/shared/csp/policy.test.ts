import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, newNonce, NONCE_HEADER } from './policy';
import shellScriptHashes from './shell-script-hashes.json';

const hashes = shellScriptHashes.map((hash) => `'${hash}'`).join(' ');

function directives(policy: string): string[] {
  return policy.split('; ');
}

describe('contentSecurityPolicy', () => {
  it('lists the directives in order, with the nonce and the shell hashes', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc==', dev: false, sentryDsn: undefined });
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
    const dev = contentSecurityPolicy({ nonce: 'n', dev: true, sentryDsn: undefined });
    const prod = contentSecurityPolicy({ nonce: 'n', dev: false, sentryDsn: undefined });
    expect(directives(dev)[1]).toBe(`script-src 'self' 'nonce-n' ${hashes} 'unsafe-eval'`);
    expect(prod).not.toContain('unsafe-eval');
  });

  it('has no strict-dynamic and no data: in worker-src', () => {
    const policy = contentSecurityPolicy({ nonce: 'n', dev: true, sentryDsn: undefined });
    expect(policy).not.toContain('strict-dynamic');
    expect(directives(policy).find((d) => d.startsWith('worker-src'))).not.toContain('data:');
  });

  it("adds the Sentry DSN's origin to connect-src, without key and path", () => {
    const policy = contentSecurityPolicy({
      nonce: 'n',
      dev: false,
      sentryDsn: 'https://k@o1.ingest.de.sentry.io/2',
    });
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
    const policy = contentSecurityPolicy({ nonce: 'n', dev: false, sentryDsn });
    expect(directives(policy)).toContain("connect-src 'self' https://api-eu.mixpanel.com");
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
