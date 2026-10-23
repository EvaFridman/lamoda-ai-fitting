import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductGridSkeleton } from './product-grid-skeleton';

function itemsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('ul > li')];
}

describe('ProductGridSkeleton', () => {
  it('draws three rows of four cards by default', () => {
    const { container } = render(<ProductGridSkeleton />);
    expect(itemsOf(container)).toHaveLength(12);
  });

  it('draws rows times four cards', () => {
    const { container } = render(<ProductGridSkeleton rows={2} />);
    expect(itemsOf(container)).toHaveLength(8);
  });

  it('marks the cards past two columns of rows, and past three, to show only in wider grids', () => {
    const { container } = render(<ProductGridSkeleton rows={3} />);
    const items = itemsOf(container);
    items.slice(0, 6).forEach((item) => {
      expect(item.className).toBe('');
    });
    items.slice(6, 9).forEach((item) => {
      expect(item).toHaveClass('fromThree');
      expect(item).not.toHaveClass('fromFour');
    });
    items.slice(9).forEach((item) => {
      expect(item).toHaveClass('fromFour');
      expect(item).not.toHaveClass('fromThree');
    });
  });

  it('follows the rows given for the thresholds', () => {
    const { container } = render(<ProductGridSkeleton rows={1} />);
    const items = itemsOf(container);
    expect(items.map((item) => item.className)).toEqual(['', '', 'fromThree', 'fromFour']);
  });

  it('is hidden from screen readers', () => {
    const { container } = render(<ProductGridSkeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
