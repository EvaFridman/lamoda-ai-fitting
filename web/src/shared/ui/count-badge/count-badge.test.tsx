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

  it("takes the parent's class", () => {
    render(<CountBadge count={2} className="corner" />);
    expect(screen.getByText('2')).toHaveClass('corner');
  });
});
