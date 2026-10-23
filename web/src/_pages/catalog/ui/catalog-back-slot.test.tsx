import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CatalogBackSlot } from './catalog-back-slot';

describe('CatalogBackSlot', () => {
  it('holds no link or button', () => {
    const { container } = render(<CatalogBackSlot />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
