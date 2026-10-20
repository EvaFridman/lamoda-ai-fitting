import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Menu, MenuHeader, MenuItem, MenuLinkItem, MenuSeparator } from '@/shared/ui';

const navigated = vi.hoisted(() => vi.fn());

// jsdom cannot navigate: the link is a plain anchor that reports the click and cancels it.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({
      href,
      onClick,
      ...props
    }: {
      href: string;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement('a', {
        ...props,
        href,
        onClick: (event: { preventDefault: () => void }) => {
          onClick?.(event);
          event.preventDefault();
          navigated(href);
        },
      }),
  };
});

interface Handlers {
  onEditPointerEnter?: () => void;
  onOpenChange?: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onLocked?: () => void;
}

function Actions({ onOpenChange, onEdit, onEditPointerEnter, onDelete, onLocked }: Handlers) {
  return (
    <Menu trigger={<button type="button">Действия</button>} onOpenChange={onOpenChange}>
      <MenuHeader className="mp-block">Заголовок</MenuHeader>
      <MenuItem onClick={onEdit} onPointerEnter={onEditPointerEnter}>
        Изменить
      </MenuItem>
      <MenuItem onClick={onLocked} disabled>
        Закрыто
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={onDelete}>Удалить</MenuItem>
    </Menu>
  );
}

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

// Base UI ignores an open that comes soon after the popup of the previous test, so the opening is
// retried until the menu is there.
async function open(user: User, how: 'click' | 'Enter' | 'Space' | 'ArrowDown') {
  const trigger = screen.getByRole('button', { name: 'Действия' });
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      if (how === 'click') await user.click(trigger);
      else {
        trigger.focus();
        await user.keyboard(how === 'Space' ? ' ' : `{${how}}`);
      }
    }
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  // The keys go to the menu only once the focus has moved into it.
  await vi.waitFor(() => expect(trigger).not.toHaveFocus());
  return trigger;
}

function highlighted() {
  return screen.getAllByRole('menuitem').find((item) => item.hasAttribute('data-highlighted'))
    ?.textContent;
}

describe('Menu', () => {
  it('has a collapsed trigger with aria-haspopup and renders no menu until opened', () => {
    render(<Actions />);

    const trigger = screen.getByRole('button', { name: 'Действия' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens by click and lists items, a separator and a header', async () => {
    const onOpenChange = vi.fn();
    render(<Actions onOpenChange={onOpenChange} />);

    await open(setup(), 'click');

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Изменить',
      'Закрыто',
      'Удалить',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Заголовок' })).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('renders the header as a role="none" block with the given class, not as an item', async () => {
    render(<Actions />);

    await open(setup(), 'click');

    const header = screen.getByText('Заголовок');
    expect(header).toHaveAttribute('role', 'none');
    expect(header).toHaveClass('mp-block');
    expect(screen.queryByRole('menuitem', { name: 'Заголовок' })).not.toBeInTheDocument();
  });

  it('passes handlers given to an item through to the menuitem element', async () => {
    const user = setup();
    const onEditPointerEnter = vi.fn();
    render(<Actions onEditPointerEnter={onEditPointerEnter} />);

    await open(user, 'click');
    expect(onEditPointerEnter).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(onEditPointerEnter).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('menuitem', { name: 'Изменить' }));

    expect(onEditPointerEnter).toHaveBeenCalledTimes(1);
  });

  it('opens by Enter on the focused trigger', async () => {
    render(<Actions />);

    await open(setup(), 'Enter');

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens by the down arrow and moves the highlight over items, disabled ones too', async () => {
    const user = setup();
    render(<Actions />);

    await open(user, 'ArrowDown');
    await vi.waitFor(() => expect(highlighted()).toBeDefined());
    const first = highlighted();
    expect(first).toBe('Изменить');

    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(highlighted()).toBe('Закрыто'));

    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(highlighted()).toBe('Удалить'));

    await user.keyboard('{ArrowUp}');
    await vi.waitFor(() => expect(highlighted()).toBe('Закрыто'));
  });

  it('marks a disabled item aria-disabled and ignores click and Enter on it', async () => {
    const user = setup();
    const onLocked = vi.fn();
    const onOpenChange = vi.fn();
    render(<Actions onLocked={onLocked} onOpenChange={onOpenChange} />);

    await open(user, 'click');
    const locked = screen.getByRole('menuitem', { name: 'Закрыто' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');

    await user.click(locked);
    locked.focus();
    await user.keyboard('{Enter}');

    expect(onLocked).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('runs an enabled item once on Enter, closes and returns the focus to the trigger', async () => {
    const user = setup();
    const onEdit = vi.fn();
    const onOpenChange = vi.fn();
    render(<Actions onEdit={onEdit} onOpenChange={onOpenChange} />);

    const trigger = await open(user, 'Enter');
    await vi.waitFor(() => expect(highlighted()).toBe('Изменить'));
    await user.keyboard('{Enter}');

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('runs an item on click and closes', async () => {
    const user = setup();
    const onDelete = vi.fn();
    render(<Actions onDelete={onDelete} />);

    await open(user, 'click');
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('never reaches the header above the items with the arrows, and loops at both ends', async () => {
    const user = setup();
    render(<Actions />);

    await open(user, 'ArrowDown');
    await vi.waitFor(() => expect(highlighted()).toBe('Изменить'));
    const block = screen.getByText('Заголовок');

    await user.keyboard('{ArrowUp}');
    await vi.waitFor(() => expect(highlighted()).toBe('Удалить'));
    expect(block).not.toHaveAttribute('data-highlighted');
    expect(block).not.toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(highlighted()).toBe('Изменить'));
    expect(block).not.toHaveAttribute('data-highlighted');
    expect(block).not.toHaveFocus();
  });

  it('closes on a press outside the menu and reports it', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <>
        <Actions onOpenChange={onOpenChange} />
        <button type="button">Снаружи</button>
      </>,
    );

    const trigger = await open(user, 'click');
    await user.click(screen.getByRole('button', { name: 'Снаружи' }));

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('closes on Esc and returns the focus to the trigger', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(<Actions onOpenChange={onOpenChange} />);

    const trigger = await open(user, 'click');
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('MenuLinkItem', () => {
  interface LinkHandlers {
    onClick?: () => void;
    onPointerEnter?: () => void;
  }

  function Links({ onClick, onPointerEnter }: LinkHandlers) {
    return (
      <Menu trigger={<button type="button">Действия</button>}>
        <MenuItem>Изменить</MenuItem>
        <MenuLinkItem href="/customer/orders" onClick={onClick} onPointerEnter={onPointerEnter}>
          Мои заказы
        </MenuLinkItem>
      </Menu>
    );
  }

  beforeEach(() => {
    navigated.mockReset();
  });

  it('renders an anchor with role="menuitem" and its href', async () => {
    render(<Links />);

    await open(setup(), 'click');

    const link = screen.getByRole('menuitem', { name: 'Мои заказы' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/customer/orders');
    expect(link).not.toHaveAttribute('aria-disabled');
  });

  it('is reached with the arrows among the items and opened by Enter, which closes the menu', async () => {
    const user = setup();
    const onClick = vi.fn();
    render(<Links onClick={onClick} />);

    const trigger = await open(user, 'ArrowDown');
    await vi.waitFor(() => expect(highlighted()).toBe('Изменить'));
    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(highlighted()).toBe('Мои заказы'));
    await user.keyboard('{Enter}');

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(navigated).toHaveBeenCalledExactlyOnceWith('/customer/orders');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates on click, closes the menu and calls onClick', async () => {
    const user = setup();
    const onClick = vi.fn();
    render(<Links onClick={onClick} />);

    await open(user, 'click');
    await user.click(screen.getByRole('menuitem', { name: 'Мои заказы' }));

    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(navigated).toHaveBeenCalledExactlyOnceWith('/customer/orders');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('passes onPointerEnter through to the anchor', async () => {
    const user = setup();
    const onPointerEnter = vi.fn();
    render(<Links onPointerEnter={onPointerEnter} />);

    await open(user, 'click');
    expect(onPointerEnter).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('menuitem', { name: 'Мои заказы' }));

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });
});
