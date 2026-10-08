import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '@/shared/ui';

describe('Spinner', () => {
  it('is a progressbar named "Загрузка" by default', () => {
    render(<Spinner />);

    expect(screen.getByRole('progressbar', { name: 'Загрузка' })).toBeInTheDocument();
  });

  it('takes a custom label', () => {
    render(<Spinner label="Примеряем" />);

    expect(screen.getByRole('progressbar', { name: 'Примеряем' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Загрузка' })).not.toBeInTheDocument();
  });

  it('is 24px by default and 64px on request', () => {
    const { rerender } = render(<Spinner />);
    expect(screen.getByRole('progressbar')).toHaveClass('size24');

    rerender(<Spinner size={64} />);
    expect(screen.getByRole('progressbar')).toHaveClass('size64');
    expect(screen.getByRole('progressbar')).not.toHaveClass('size24');
  });

  it('can be hidden with aria-hidden and merges className', () => {
    render(<Spinner aria-hidden className="mine" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(document.querySelector('.mine')).toHaveAttribute('aria-hidden', 'true');
  });
});
