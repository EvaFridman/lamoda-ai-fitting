import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SoonChip } from './soon-chip';

describe('SoonChip', () => {
  it('says «скоро», hidden from screen readers', () => {
    render(<SoonChip />);
    expect(screen.getByText('скоро')).toHaveAttribute('aria-hidden', 'true');
  });

  it("takes the parent's class and keeps its own", () => {
    render(<SoonChip className="corner" />);
    const chip = screen.getByText('скоро');
    expect(chip).toHaveClass('corner');
    expect(chip).toHaveClass('chip');
  });
});
