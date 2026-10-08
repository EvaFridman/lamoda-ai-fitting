import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/shared/ui';

describe('Button', () => {
  it('renders a button of type "button" named by its label', () => {
    render(<Button>Добавить в корзину</Button>);

    const button = screen.getByRole('button', { name: 'Добавить в корзину' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('calls onClick on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Применить</Button>);

    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is reached by Tab and activated by Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Применить</Button>);

    await user.tab();
    const button = screen.getByRole('button', { name: 'Применить' });
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the variant, size and text size in its classes', () => {
    const { rerender } = render(<Button>A</Button>);
    const primary = screen.getByRole('button').className;

    rerender(
      <Button variant="outline" size={32} textSize="body-s" fullWidth>
        A
      </Button>,
    );
    const button = screen.getByRole('button');

    expect(button.className).not.toBe(primary);
    expect(button).toHaveClass('outline', 'size32', 'textBodyS', 'fullWidth');
  });

  it('merges className', () => {
    render(<Button className="mine">A</Button>);

    expect(screen.getByRole('button')).toHaveClass('mine');
  });

  describe('disabled', () => {
    it('is natively disabled, skipped by Tab and ignores clicks', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Нет в наличии
        </Button>,
      );

      const button = screen.getByRole('button', { name: 'Нет в наличии' });
      expect(button).toBeDisabled();

      await user.tab();
      expect(button).not.toHaveFocus();
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('loading', () => {
    it('sets aria-busy and keeps the label as the accessible name', () => {
      render(<Button loading>Добавить в корзину</Button>);

      const button = screen.getByRole('button', { name: 'Добавить в корзину' });
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('shows a spinner hidden from assistive technology', () => {
      const { container } = render(<Button loading>Добавить в корзину</Button>);

      expect(container.querySelector('[role="progressbar"]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('has no spinner when not loading', () => {
      const { container } = render(<Button>Добавить в корзину</Button>);

      expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    it('stays focusable by Tab', async () => {
      const user = userEvent.setup();
      render(<Button loading>Добавить в корзину</Button>);

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('ignores click, Enter and Space', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Добавить в корзину
        </Button>,
      );

      await user.click(screen.getByRole('button'));
      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('disabled and loading together', () => {
    it('lets disabled win: no busy state, no spinner, not focusable, no clicks', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const { container } = render(
        <Button disabled loading onClick={onClick}>
          Применить
        </Button>,
      );

      const button = screen.getByRole('button', { name: 'Применить' });
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute('aria-busy');
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(button).toHaveClass('disabled');
      expect(button).not.toHaveClass('loading');

      await user.tab();
      expect(button).not.toHaveFocus();
      await user.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  it('accepts clicks again when loading ends', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button loading onClick={onClick}>
        Применить
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Button onClick={onClick}>Применить</Button>);
    const button = screen.getByRole('button', { name: 'Применить' });
    expect(button).not.toHaveAttribute('aria-busy');
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('with href', () => {
    it('renders a link with that href and the label as its name, not a button', () => {
      render(<Button href="/cart">Оценить товары · 1</Button>);

      const link = screen.getByRole('link', { name: 'Оценить товары · 1' });
      expect(link).toHaveAttribute('href', '/cart');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('wears the button look', () => {
      render(
        <Button href="/cart" variant="secondary" size={40}>
          Оценить
        </Button>,
      );

      expect(screen.getByRole('link')).toHaveClass('button', 'secondary', 'size40');
    });

    it('is reached by Tab', async () => {
      const user = userEvent.setup();
      render(<Button href="/cart">Оценить</Button>);

      await user.tab();

      expect(screen.getByRole('link', { name: 'Оценить' })).toHaveFocus();
    });
  });
});
