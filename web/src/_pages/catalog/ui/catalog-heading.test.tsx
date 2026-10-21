import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CatalogHeading } from './catalog-heading';

describe('CatalogHeading', () => {
  it('is the level 1 heading with the count after the title', () => {
    render(<CatalogHeading title="Платья" total={128} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Платья 128 товаров');
  });

  it('has no count until the counts load', () => {
    render(<CatalogHeading title="Платья" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Платья$/);
  });

  it('can be focused by a script but is not in the tab order', () => {
    render(<CatalogHeading title="Платья" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('tabindex', '-1');
    heading.focus();
    expect(heading).toHaveFocus();
  });
});
