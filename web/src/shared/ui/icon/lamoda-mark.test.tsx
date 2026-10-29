import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  LAMODA_MARK_HEIGHT,
  LAMODA_MARK_PATHS,
  LAMODA_MARK_WIDTH,
  LamodaMark,
} from './lamoda-mark';

describe('LamodaMark', () => {
  it('draws the wordmark paths in a hidden svg painted with currentColor', () => {
    const { container } = render(<LamodaMark />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 20.1055 16');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(LAMODA_MARK_WIDTH).toBe(20.1055);
    expect(LAMODA_MARK_HEIGHT).toBe(16);
    expect(Array.from(container.querySelectorAll('path'), (p) => p.getAttribute('d'))).toEqual([
      ...LAMODA_MARK_PATHS,
    ]);
  });

  it('passes fill and placement to the svg', () => {
    const { container } = render(<LamodaMark fill="#fff" x={5.95} y={8} width={20} height={16} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', '#fff');
    expect(svg).toHaveAttribute('x', '5.95');
    expect(svg).toHaveAttribute('y', '8');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '16');
  });
});

describe('app/icon.svg', () => {
  // Vitest runs from web/.
  const source = readFileSync(join(process.cwd(), 'app', 'icon.svg'), 'utf8');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');

  it('is a 32x32 black square', () => {
    const svg = doc.documentElement;
    const rect = doc.querySelector('rect');

    // The file is parsed as XML, so jest-dom's matchers refuse its elements.
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
    expect(rect?.getAttribute('width')).toBe('32');
    expect(rect?.getAttribute('height')).toBe('32');
    expect(rect?.getAttribute('fill')).toBe('#000');
  });

  it('repeats the mark paths in white, in order', () => {
    expect(Array.from(doc.querySelectorAll('path'), (p) => p.getAttribute('d'))).toEqual([
      ...LAMODA_MARK_PATHS,
    ]);
    expect(doc.querySelector('g')?.getAttribute('fill')).toBe('#fff');
  });
});
