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

  describe('fullLoad', () => {
    // Records whether the click was already cancelled by the link (next/link cancels it to navigate
    // on the client), then cancels it so jsdom does not try to navigate.
    function watchClicks() {
      const cancelled: boolean[] = [];
      const listener = (event: Event) => {
        cancelled.push(event.defaultPrevented);
        event.preventDefault();
      };
      document.addEventListener('click', listener);
      return { cancelled, stop: () => document.removeEventListener('click', listener) };
    }

    it('is a plain anchor with the same classes, href and handlers', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Link
          href="/customer/stores"
          fullLoad
          className="mine"
          variant="secondary"
          onClick={onClick}
        >
          Магазины
        </Link>,
      );

      const link = screen.getByRole('link', { name: 'Магазины' });
      expect(link).toHaveAttribute('href', '/customer/stores');
      expect(link).toHaveClass('link', 'secondary', 'mine');
      expect(link).not.toHaveAttribute('fullload');
      expect(link).not.toHaveAttribute('fullLoad');

      const watch = watchClicks();
      await user.click(link);
      watch.stop();

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(watch.cancelled).toEqual([false]);
    });

    it('is primary by default', () => {
      render(
        <Link href="/a" fullLoad>
          A
        </Link>,
      );

      expect(screen.getByRole('link')).toHaveClass('link', 'primary');
    });

    it('passes the attributes of another site link', () => {
      render(
        <Link href="https://example.com/" fullLoad target="_blank" rel="noopener noreferrer">
          A
        </Link>,
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('is reached by Tab', async () => {
    const user = userEvent.setup();
    render(<Link href="/a">A</Link>);

    await user.tab();

    expect(screen.getByRole('link')).toHaveFocus();
  });
});
