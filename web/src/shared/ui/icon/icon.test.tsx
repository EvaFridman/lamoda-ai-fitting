import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import * as ui from '@/shared/ui';

import { createIcon } from './icon';

const FullIcon = createIcon('FullIcon', {
  16: <path d="M0 0h16" stroke="currentColor" />,
  24: <path d="M0 0h24" stroke="currentColor" />,
});
const Only24Icon = createIcon('Only24Icon', { 24: <path d="M0 0h24" stroke="currentColor" /> });
const Only16Icon = createIcon('Only16Icon', { 16: <path d="M0 0h16" stroke="currentColor" /> });

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no svg rendered');
  return svg;
}

describe('createIcon', () => {
  it('is 24px by default', () => {
    const { container } = render(<FullIcon />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('draws the 16px art at size 16', () => {
    const { container } = render(<FullIcon size={16} />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
    expect(svg.querySelector('path')).toHaveAttribute('d', 'M0 0h16');
  });

  it('scales the only 24px drawing to 16px through the viewBox', () => {
    const { container } = render(<Only24Icon size={16} />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg.querySelector('path')).toHaveAttribute('d', 'M0 0h24');
  });

  it('scales the only 16px drawing to 24px through the viewBox', () => {
    const { container } = render(<Only16Icon size={24} />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
    expect(svg.querySelector('path')).toHaveAttribute('d', 'M0 0h16');
  });

  it('is hidden from assistive technology without a title', () => {
    const { container } = render(<FullIcon />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).not.toHaveAttribute('role');
    expect(svg.querySelector('title')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('gets the title as its accessible name', () => {
    const { container } = render(<FullIcon title="Корзина" />);
    const svg = svgOf(container);

    expect(screen.getByRole('img', { name: 'Корзина' })).toBe(svg);
    expect(svg.querySelector('title')).toHaveTextContent('Корзина');
    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  it('merges className with its own class', () => {
    const { container } = render(<FullIcon className="mine" />);
    const svg = svgOf(container);

    expect(svg).toHaveClass('mine');
    expect(svg.getAttribute('class')).toMatch(/\bicon\b/);
  });

  it('keeps its own class without className', () => {
    const { container } = render(<FullIcon />);

    expect(svgOf(container).getAttribute('class')).toMatch(/\bicon\b/);
  });

  it('lets passed props override the defaults and passes others through', () => {
    const { container } = render(<FullIcon aria-hidden={false} data-testid="x" data-kind="a" />);
    const svg = svgOf(container);

    expect(svg).toHaveAttribute('aria-hidden', 'false');
    expect(svg).toHaveAttribute('data-kind', 'a');
    expect(svg).toHaveAttribute('data-testid', 'x');
  });

  it('sets the displayName', () => {
    expect(FullIcon.displayName).toBe('FullIcon');
  });
});

const icons = Object.entries(ui).filter(([name]) => name.endsWith('Icon')) as [
  string,
  ComponentType<ui.IconProps>,
][];

describe('the icon set', () => {
  it('exports 16 icons', () => {
    expect(icons).toHaveLength(16);
  });

  describe.each(icons)('%s', (_name, Icon) => {
    it.each([16, 24] as const)('renders a drawing at %ipx painted with currentColor', (size) => {
      const { container } = render(<Icon size={size} />);
      const svg = svgOf(container);

      expect(svg).toHaveAttribute('width', String(size));
      expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(1);
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        for (const attr of ['fill', 'stroke']) {
          const value = el.getAttribute(attr);
          if (value !== null) expect(['none', 'currentColor']).toContain(value);
        }
      }
    });
  });
});
