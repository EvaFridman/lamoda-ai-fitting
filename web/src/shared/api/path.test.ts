import { describe, expect, it } from 'vitest';

import { ApiError, buildPath } from './index';

function refusal(make: () => unknown): ApiError {
  try {
    make();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected buildPath to throw');
}

// The template is a literal in real code; these cases pass strings the types would not allow.
const loose = buildPath as (template: string, params?: object, query?: object) => { path: string };

describe('buildPath params', () => {
  it('keeps a template without params as it is', () => {
    expect(buildPath('/products')).toMatchObject({ path: '/products', template: '/products' });
  });

  it('encodes a param taken from input into one segment', () => {
    expect(buildPath('/products/:id', { id: '../users' }).path).toBe('/products/..%2Fusers');
    expect(buildPath('/products/:id', { id: 'a/b' }).path).toBe('/products/a%2Fb');
  });

  it('encodes ? # % and spaces', () => {
    expect(buildPath('/p/:id', { id: 'a?b#c%d e' }).path).toBe('/p/a%3Fb%23c%25d%20e');
  });

  it('percent-encodes unicode values', () => {
    expect(buildPath('/p/:id', { id: 'платье' }).path).toBe(
      '/p/%D0%BF%D0%BB%D0%B0%D1%82%D1%8C%D0%B5',
    );
    expect(buildPath('/p/:id', { id: '👗' }).path).toBe('/p/%F0%9F%91%97');
  });

  it('accepts numbers, including 0', () => {
    expect(buildPath('/p/:id', { id: 42 }).path).toBe('/p/42');
    expect(buildPath('/p/:id', { id: 0 }).path).toBe('/p/0');
  });

  it('fills several params', () => {
    expect(buildPath('/brands/:brandId/products/:id', { brandId: 'a', id: 'b/c' }).path).toBe(
      '/brands/a/products/b%2Fc',
    );
  });

  it('allows dots inside a longer value', () => {
    expect(buildPath('/p/:id', { id: '...' }).path).toBe('/p/...');
    expect(buildPath('/p/:id', { id: 'a.b' }).path).toBe('/p/a.b');
  });

  it.each(['', '.', '..'])('refuses the param value %j with kind path', (id) => {
    const error = refusal(() => buildPath('/p/:id', { id }));
    expect(error.kind).toBe('path');
    expect(error.template).toBe('/p/:id');
  });

  it('refuses a param with no value', () => {
    const error = refusal(() => loose('/p/:id', {}));
    expect(error).toMatchObject({ kind: 'path', template: '/p/:id' });
    expect(refusal(() => loose('/p/:id')).kind).toBe('path');
    expect(refusal(() => loose('/p/:id', { id: undefined })).kind).toBe('path');
  });

  it.each([
    ['a high surrogate', String.fromCharCode(0xd800)],
    ['a low surrogate', String.fromCharCode(0xdc00)],
    ['a surrogate inside text', `a${String.fromCharCode(0xd800)}b`],
  ])('refuses %s in a param with kind path, not a URIError', (_name, id) => {
    const error = refusal(() => buildPath('/p/:id', { id }));
    expect(error).toMatchObject({ kind: 'path', template: '/p/:id' });
  });

  it('still takes a well-formed surrogate pair', () => {
    const pair = String.fromCharCode(0xd83d, 0xdc57);
    expect(buildPath('/p/:id', { id: pair }).path).toBe('/p/%F0%9F%91%97');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not take the param %s from the prototype',
    (name) => {
      const error = refusal(() => loose(`/p/:${name}`, {}));
      expect(error.kind).toBe('path');
    },
  );
});

describe('buildPath template', () => {
  it.each(['x', '', '//evil', '/\\evil', '/a\\b', '/a?b=1', '/a#frag', 'http://evil/x'])(
    'refuses the template %j with kind path',
    (template) => {
      const error = refusal(() => loose(template));
      expect(error.kind).toBe('path');
      expect(error.template).toBe(template);
    },
  );

  const TAB = String.fromCharCode(9);
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);

  it.each([
    ['a tab as a segment', `/${TAB}/evil.example`],
    ['a newline inside a segment', `/a${LF}b`],
    ['a carriage return at the end', `/a${CR}`],
    ['a tab right after the slash', `/${TAB}evil`],
    ['a newline in a later segment', `/a/b${LF}/c`],
  ])('refuses %s with kind path', (_name, template) => {
    const error = refusal(() => loose(template));
    expect(error).toMatchObject({ kind: 'path', template });
  });

  it.each(['/files/:name.json', '/a/:id-:rev', '/x/12:30', '/a:b', '/:1x', '/a/:', '/::id'])(
    'refuses a colon that is not a whole :name segment in %j',
    (template) => {
      const params = { name: 'a', id: 'b', rev: 'c', b: 'd', _x: 'e' };
      const error = refusal(() => loose(template, params));
      expect(error).toMatchObject({ kind: 'path', template });
    },
  );

  it('accepts whole :name segments', () => {
    expect(buildPath('/products/:id', { id: 'a' }).path).toBe('/products/a');
    expect(buildPath('/a/:id/b/:rev_2', { id: 'x', rev_2: 'y' }).path).toBe('/a/x/b/y');
    expect(loose('/:_x', { _x: 'z' }).path).toBe('/z');
  });

  it('keeps the template without the query', () => {
    const result = buildPath('/p/:id', { id: 'a' }, { page: 2 });
    expect(result.template).toBe('/p/:id');
    expect(result.path).toBe('/p/a?page=2');
  });
});

describe('buildPath query', () => {
  it('stringifies strings, numbers and booleans', () => {
    expect(buildPath('/p', {}, { a: 'x', b: 2, c: true, d: false }).path).toBe(
      '/p?a=x&b=2&c=true&d=false',
    );
  });

  it('writes an array as repeated keys', () => {
    expect(buildPath('/p', {}, { brand: ['a', 'b'], size: [1, 2] }).path).toBe(
      '/p?brand=a&brand=b&size=1&size=2',
    );
  });

  it('skips null and undefined, also inside no-op queries', () => {
    expect(buildPath('/p', {}, { a: null, b: undefined, c: 'x' }).path).toBe('/p?c=x');
    expect(buildPath('/p', {}, { a: null }).path).toBe('/p');
  });

  it('keeps 0, false and an empty string', () => {
    expect(buildPath('/p', {}, { a: 0, b: false, c: '' }).path).toBe('/p?a=0&b=false&c=');
  });

  it('encodes special characters in keys and values', () => {
    const { path } = buildPath('/p', {}, { 'a&b': 'c=d&e#f', q: 'платье' });
    expect(path).toBe('/p?a%26b=c%3Dd%26e%23f&q=%D0%BF%D0%BB%D0%B0%D1%82%D1%8C%D0%B5');
  });

  it('adds no ? for an empty query or an empty array', () => {
    expect(buildPath('/p').path).toBe('/p');
    expect(buildPath('/p', {}, {}).path).toBe('/p');
    expect(buildPath('/p', {}, { a: [] }).path).toBe('/p');
  });
});
