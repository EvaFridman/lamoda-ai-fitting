import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CountBadge } from './count-badge';

describe('CountBadge', () => {
  it.each([0, -1, -10])('draws nothing for %s', (count) => {
    const { container } = render(<CountBadge count={count} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([1, 3, 5])('shows %s, hidden from screen readers', (count) => {
    render(<CountBadge count={count} />);
    const badge = screen.getByText(String(count));
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  // jsdom applies the compiled module styles, so literal values are readable (not `var(...)`).
  it.each([1, 2])('centres the digit %s in a flex box with a single line height', (count) => {
    render(<CountBadge count={count} />);
    const style = getComputedStyle(screen.getByText(String(count)));
    expect(style.display).toBe('inline-flex');
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('center');
    expect(style.lineHeight).toBe('1');
    expect(style.minWidth).toBe('18px');
    expect(style.height).toBe('18px');
    expect(style.paddingLeft).toBe('4px');
    expect(style.paddingRight).toBe('4px');
  });

  it.each([
    [9, 9, '9'],
    [10, 9, '9+'],
    [250, 9, '9+'],
    [3, 2, '2+'],
  ])('with %s and max %s shows «%s»', (count, max, shown) => {
    render(<CountBadge count={count} max={max} />);
    expect(screen.getByText(shown)).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the whole count with no max', () => {
    render(<CountBadge count={120} />);
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('draws nothing at 0 whatever the max', () => {
    const { container } = render(<CountBadge count={0} max={9} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("takes the parent's class", () => {
    render(<CountBadge count={2} className="corner" />);
    expect(screen.getByText('2')).toHaveClass('corner');
  });
});
