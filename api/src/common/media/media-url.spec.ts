import { describe, expect, it } from 'vitest';

import { toMediaUrl } from './media-url.js';

describe('toMediaUrl', () => {
  it.each([
    ['http://localhost:3001/media/', 'http://localhost:3001/media/a.webp'],
    ['http://localhost:3001/media', 'http://localhost:3001/media/a.webp'],
    ['https://lamoda-ai-fitting.ru/media/', 'https://lamoda-ai-fitting.ru/media/a.webp'],
    ['https://lamoda-ai-fitting.ru/media', 'https://lamoda-ai-fitting.ru/media/a.webp'],
    ['https://x.ru/', 'https://x.ru/a.webp'],
    ['https://x.ru', 'https://x.ru/a.webp'],
  ])('joins %s and a key', (base, expected) => {
    expect(toMediaUrl(base, 'a.webp')).toBe(expected);
  });

  it('keeps nested keys', () => {
    expect(
      toMediaUrl(
        'https://lamoda-ai-fitting.ru/media',
        'products/3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c/1.webp',
      ),
    ).toBe(
      'https://lamoda-ai-fitting.ru/media/products/3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c/1.webp',
    );
  });

  it('drops the base query and hash', () => {
    expect(toMediaUrl('https://x.ru/media?v=1#top', 'a.webp')).toBe('https://x.ru/media/a.webp');
  });

  const escaping = [
    '../x',
    '../media-other/x',
    '%2e%2e/x',
    '%2E%2E/x',
    'a/../../x',
    '//evil.com/x',
    '/x',
    'https://evil.com/x',
    '\\evil.com/x',
    '\\\\evil.com\\x',
    'javascript:alert(1)',
    'a.webp?x=1',
    'a.webp#frag',
    '?x=1',
    '#frag',
  ];

  it.each(escaping)('refuses the key %j under a base with a path', (key) => {
    expect(() => toMediaUrl('https://x.ru/media/', key)).toThrow(/escapes MEDIA_BASE_URL/);
  });

  it.each([
    '//evil.com/x',
    'https://evil.com/x',
    '\\\\evil.com/x',
    'javascript:alert(1)',
    'a?b',
    'a#b',
  ])('refuses the key %j under a root base', (key) => {
    expect(() => toMediaUrl('https://x.ru', key)).toThrow(/escapes MEDIA_BASE_URL/);
  });

  it.each(['', '.', './'])('refuses the key %j that points at the base itself', (key) => {
    expect(() => toMediaUrl('https://x.ru/media/', key)).toThrow(/escapes MEDIA_BASE_URL/);
    expect(() => toMediaUrl('https://x.ru', key)).toThrow(/escapes MEDIA_BASE_URL/);
  });

  it('refuses a base that is not a URL', () => {
    expect(() => toMediaUrl('not a url', 'a.webp')).toThrow();
  });
});
