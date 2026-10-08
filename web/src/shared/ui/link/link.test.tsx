import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Link } from '@/shared/ui';

describe('Link', () => {
  it('is a link with its href and text', () => {
    render(<Link href="/sizes">Таблица размеров</Link>);

    expect(screen.getByRole('link', { name: 'Таблица размеров' })).toHaveAttribute(
      'href',
      '/sizes',
    );
  });

  it('is primary by default and secondary on request', () => {
    const { rerender } = render(<Link href="/a">A</Link>);
    expect(screen.getByRole('link')).toHaveClass('link', 'primary');

    rerender(
      <Link href="/a" variant="secondary">
        A
      </Link>,
    );
    expect(screen.getByRole('link')).toHaveClass('link', 'secondary');
    expect(screen.getByRole('link')).not.toHaveClass('primary');
  });

  it('merges className and passes other props', () => {
    render(
      <Link href="/a" className="mine" aria-label="Размеры">
        A
      </Link>,
    );

    expect(screen.getByRole('link', { name: 'Размеры' })).toHaveClass('mine');
  });

  it('is reached by Tab', async () => {
    const user = userEvent.setup();
    render(<Link href="/a">A</Link>);

    await user.tab();

    expect(screen.getByRole('link')).toHaveFocus();
  });
});
