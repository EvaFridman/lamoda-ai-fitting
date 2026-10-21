import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Link, LinkButton } from '@/shared/ui';

describe('LinkButton', () => {
  it('is a button that submits nothing and calls onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <form>
        <LinkButton onClick={onClick}>Удалить аккаунт</LinkButton>
      </form>,
    );

    const button = screen.getByRole('button', { name: 'Удалить аккаунт' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is primary by default and secondary on request, with the link classes', () => {
    const { rerender } = render(<LinkButton>A</LinkButton>);
    expect(screen.getByRole('button')).toHaveClass('link', 'primary');

    rerender(<LinkButton variant="secondary">A</LinkButton>);
    expect(screen.getByRole('button')).toHaveClass('link', 'secondary');
    expect(screen.getByRole('button')).not.toHaveClass('primary');
  });

  it('merges className and passes other props', () => {
    render(
      <LinkButton className="mine" aria-label="Удалить" disabled>
        A
      </LinkButton>,
    );

    const button = screen.getByRole('button', { name: 'Удалить' });
    expect(button).toHaveClass('link', 'mine');
    expect(button).toBeDisabled();
  });

  it('is reached by Tab', async () => {
    const user = userEvent.setup();
    render(<LinkButton>A</LinkButton>);

    await user.tab();

    expect(screen.getByRole('button')).toHaveFocus();
  });
});

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
