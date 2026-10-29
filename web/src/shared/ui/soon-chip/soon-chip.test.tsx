import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SoonChip } from './soon-chip';

describe('SoonChip', () => {
  it('says «скоро», hidden from screen readers', () => {
    render(<SoonChip />);
    expect(screen.getByText('скоро')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is a grey chip: tertiary fill, secondary text, 18px high', () => {
    render(<SoonChip />);
    const style = getComputedStyle(screen.getByText('скоро'));
    expect(style.backgroundColor).toBe('var(--color-background-tertiary)');
    expect(style.color).toBe('var(--color-text-secondary)');
    expect(style.height).toBe('18px');
  });

  it("takes the parent's class and keeps its own", () => {
    render(<SoonChip className="corner" />);
    const chip = screen.getByText('скоро');
    expect(chip).toHaveClass('corner');
    expect(chip).toHaveClass('chip');
  });
});
