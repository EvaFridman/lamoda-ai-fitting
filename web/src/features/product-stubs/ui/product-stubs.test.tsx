import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartStubButton, FavoriteStub, showStubToast } from './product-stubs';

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: toast.showToast,
}));

const TEXT = 'В прототипе нет корзины и избранного';

beforeEach(() => {
  toast.showToast.mockReset();
});

describe('showStubToast', () => {
  it('says there are no cart and favourites in the prototype', () => {
    showStubToast();

    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith({ title: TEXT });
  });
});

describe('CartStubButton', () => {
  it('is enabled and shows the toast on a click', async () => {
    render(<CartStubButton>Добавить в корзину</CartStubButton>);
    const button = screen.getByRole('button', { name: 'Добавить в корзину' });

    expect(button).toBeEnabled();
    await userEvent.setup().click(button);

    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith({ title: TEXT });
  });

  it('reports the tracked click before the toast', async () => {
    const order: string[] = [];
    const onClick = vi.fn(() => order.push('click'));
    toast.showToast.mockImplementation(() => order.push('toast'));
    render(<CartStubButton events={{ onClick }}>В корзину</CartStubButton>);

    await userEvent.setup().click(screen.getByRole('button', { name: 'В корзину' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(order).toEqual(['click', 'toast']);
  });

  it('hands the hover handlers to the button', async () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    render(<CartStubButton events={{ onPointerEnter, onPointerLeave }}>В корзину</CartStubButton>);
    const user = userEvent.setup();

    await user.hover(screen.getByRole('button', { name: 'В корзину' }));
    await user.unhover(screen.getByRole('button', { name: 'В корзину' }));

    expect(onPointerEnter).toHaveBeenCalled();
    expect(onPointerLeave).toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalled();
  });
});

describe('FavoriteStub', () => {
  it('is named «В избранное» and not pressed', () => {
    render(<FavoriteStub />);

    expect(screen.getByRole('button', { name: 'В избранное' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('never stays pressed: a press calls events.onClick, shows the toast and the heart is still off', async () => {
    const onClick = vi.fn();
    render(<FavoriteStub events={{ onClick }} />);
    const heart = screen.getByRole('button', { name: 'В избранное' });
    const user = userEvent.setup();

    await user.click(heart);
    await user.click(heart);

    expect(heart).toHaveAttribute('aria-pressed', 'false');
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledWith();
    expect(toast.showToast).toHaveBeenCalledTimes(2);
    expect(toast.showToast).toHaveBeenCalledWith({ title: TEXT });
  });

  it('reports the tracked click before the toast', async () => {
    const order: string[] = [];
    const onClick = vi.fn(() => order.push('click'));
    toast.showToast.mockImplementation(() => order.push('toast'));
    render(<FavoriteStub events={{ onClick }} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'В избранное' }));

    expect(order).toEqual(['click', 'toast']);
  });

  it('hands the hover handlers to the heart without a toast', async () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    render(<FavoriteStub events={{ onPointerEnter, onPointerLeave }} />);
    const heart = screen.getByRole('button', { name: 'В избранное' });
    const user = userEvent.setup();

    await user.hover(heart);
    await user.unhover(heart);

    expect(onPointerEnter).toHaveBeenCalled();
    expect(onPointerLeave).toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('shows the toast with no events given', async () => {
    render(<FavoriteStub />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'В избранное' }));

    expect(toast.showToast).toHaveBeenCalledOnce();
  });
});
