import { describe, expect, it } from 'vitest';

import { callbackUrl } from './callback-url';

describe('callbackUrl', () => {
  it('keeps a plain path', () => {
    expect(callbackUrl('/catalog/shoes', '')).toBe('/catalog/shoes');
  });

  it('adds the current query after the path', () => {
    expect(callbackUrl('/catalog', 'a=1&b=2')).toBe('/catalog?a=1&b=2');
  });

  it('adds no ? for an empty search', () => {
    expect(callbackUrl('/', '')).toBe('/');
  });

  it.each(['//evil.example', '///evil.example', '/\\evil.example', '\\\\evil.example', '/\\/x'])(
    'turns the pathname %j into one starting with a single /',
    (pathname) => {
      const result = callbackUrl(pathname, '');
      expect(result).toMatch(/^\/(?![/\\])/);
    },
  );

  it('removes the whole leading run of slashes and backslashes', () => {
    expect(callbackUrl('//evil.example', '')).toBe('/evil.example');
    expect(callbackUrl('///evil.example', '')).toBe('/evil.example');
    expect(callbackUrl('/\\evil.example', '')).toBe('/evil.example');
    expect(callbackUrl('\\\\evil.example', '')).toBe('/evil.example');
  });

  it('adds a slash to a pathname without one', () => {
    expect(callbackUrl('page', '')).toBe('/page');
  });

  it('never takes a target from the query', () => {
    const search = new URLSearchParams({ next: '//evil.example' }).toString();
    const result = callbackUrl('/page', search);
    expect(result).toBe('/page?next=%2F%2Fevil.example');
    expect(result.startsWith('/page')).toBe(true);
  });

  it('does not follow a callbackURL parameter either', () => {
    const search = new URLSearchParams({ callbackURL: 'https://evil.example' }).toString();
    expect(callbackUrl('/page', search).startsWith('/page?')).toBe(true);
  });

  it('keeps slashes inside the path', () => {
    expect(callbackUrl('/a//b', '')).toBe('/a//b');
  });
});
