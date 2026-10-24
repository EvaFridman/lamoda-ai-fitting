import { describe, expect, it } from 'vitest';

import { parseOpenAiProxyUrl } from './openai-proxy-url.js';

describe('parseOpenAiProxyUrl', () => {
  it('splits a valid address into the proxy origin and a basic token', () => {
    const proxy = parseOpenAiProxyUrl('http://proxyuser:Pw0rd9x@proxy.example.ru:3128');

    expect(proxy).toEqual({
      origin: 'http://proxy.example.ru:3128',
      token: `Basic ${Buffer.from('proxyuser:Pw0rd9x').toString('base64')}`,
    });
  });

  it('keeps the credentials out of the origin', () => {
    const proxy = parseOpenAiProxyUrl('http://proxyuser:Pw0rd9x@10.0.0.5:8080');

    expect(proxy?.origin).toBe('http://10.0.0.5:8080');
    expect(proxy?.origin).not.toContain('Pw0rd9x');
    expect(proxy?.origin).not.toContain('proxyuser');
  });

  it('accepts a single trailing slash', () => {
    expect(parseOpenAiProxyUrl('http://u1:p1@proxy.example.ru:3128/')?.origin).toBe(
      'http://proxy.example.ru:3128',
    );
  });

  it.each([
    ['empty', ''],
    ['not a url', 'not a url'],
    ['https', 'https://u1:p1@proxy.example.ru:3128'],
    ['another scheme', 'socks5://u1:p1@proxy.example.ru:3128'],
    ['no port', 'http://u1:p1@proxy.example.ru'],
    ['the default port, which URL drops', 'http://u1:p1@proxy.example.ru:80'],
    ['no credentials', 'http://proxy.example.ru:3128'],
    ['no password', 'http://u1@proxy.example.ru:3128'],
    ['no user', 'http://:p1@proxy.example.ru:3128'],
    ['a hyphen in the password', 'http://u1:p-1@proxy.example.ru:3128'],
    ['a percent escape in the password', 'http://u1:p%401@proxy.example.ru:3128'],
    ['a symbol in the user', 'http://u_1:p1@proxy.example.ru:3128'],
    ['a path', 'http://u1:p1@proxy.example.ru:3128/path'],
    ['a query', 'http://u1:p1@proxy.example.ru:3128/?x=1'],
    ['a query with no slash', 'http://u1:p1@proxy.example.ru:3128?x=1'],
    ['a fragment', 'http://u1:p1@proxy.example.ru:3128/#x'],
  ])('returns null for %s', (_name, value) => {
    expect(parseOpenAiProxyUrl(value)).toBeNull();
  });

  it('never throws on malformed input', () => {
    for (const value of ['http://', 'http://[::1', '\u0000', 'http://u:p@:3128', '::::']) {
      expect(() => parseOpenAiProxyUrl(value)).not.toThrow();
    }
  });
});
