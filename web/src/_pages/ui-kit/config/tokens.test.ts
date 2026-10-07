import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { colorGroups, fontWeights, shadows, spacing, typeScale } from './tokens';

// The first :root block of tokens.scss (the media query below it only redefines durations).
function readDeclared(): Map<string, string> {
  // Vitest runs from web/ (import.meta.url is not a file: URL in jsdom).
  const source = readFileSync(resolve(process.cwd(), 'src/shared/styles/tokens.scss'), 'utf8');
  const start = source.indexOf(':root {');
  const end = source.indexOf('\n}', start);
  const block = source.slice(start, end);

  const declared = new Map<string, string>();
  for (const line of block.split('\n')) {
    const match = /^\s*(--[\w-]+):\s*(.+?);\s*$/.exec(line);
    const [, name, value] = match ?? [];
    if (name && value) declared.set(name, value);
  }
  return declared;
}

const declared = readDeclared();

describe('ui-kit tokens against shared/styles/tokens.scss', () => {
  it('parses the declarations', () => {
    expect(declared.size).toBeGreaterThan(30);
  });

  it('lists every colour with the declared value', () => {
    const listed = colorGroups.flatMap((group) => group.tokens);
    expect(listed.length).toBeGreaterThan(0);
    for (const { token, value } of listed) {
      expect(declared.get(token), token).toBe(value);
    }
  });

  it('lists every declared colour', () => {
    const listed = new Set(colorGroups.flatMap((group) => group.tokens.map((t) => t.token)));
    const declaredColors = [...declared.keys()].filter((name) => name.startsWith('--color-'));

    expect(declaredColors.filter((name) => !listed.has(name as `--${string}`))).toEqual([]);
  });

  it('lists each colour once', () => {
    const tokens = colorGroups.flatMap((group) => group.tokens.map((t) => t.token));
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('lists every type style with the declared size and line height', () => {
    for (const { name, size, lineHeight } of typeScale) {
      expect(declared.get(`--font-size-${name}`), name).toBe(`${size}px`);
      expect(declared.get(`--line-height-${name}`), name).toBe(`${lineHeight}px`);
    }
  });

  it('lists every declared type style', () => {
    const listed = typeScale.map(({ name }) => name).sort();
    const sizes = [...declared.keys()]
      .filter((name) => name.startsWith('--font-size-'))
      .map((name) => name.slice('--font-size-'.length))
      .sort();
    const lineHeights = [...declared.keys()]
      .filter((name) => name.startsWith('--line-height-'))
      .map((name) => name.slice('--line-height-'.length))
      .sort();

    expect(listed).toEqual(sizes);
    expect(listed).toEqual(lineHeights);
  });

  it('lists every font weight with the declared value', () => {
    for (const { token, value } of fontWeights) {
      expect(declared.get(token), token).toBe(String(value));
    }
  });

  it('lists every spacing step with the declared value in px', () => {
    for (const { token, value } of spacing) {
      expect(declared.get(token), token).toBe(`${value}px`);
    }
  });

  it('lists every shadow with the declared value', () => {
    for (const { token, value } of shadows) {
      expect(declared.get(token), token).toBe(value);
    }
  });
});
