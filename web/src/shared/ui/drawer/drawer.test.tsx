import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Drawer, DrawerClose } from '@/shared/ui';

type User = ReturnType<typeof userEvent.setup>;

// See modal.test.tsx: the styles that give pointer events back to the sheet are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <Drawer
        trigger={<Button>Корзина</Button>}
        title="Ваша корзина"
        onOpenChange={onOpenChange}
        footer={
          <DrawerClose>
            <Button>Оформить</Button>
          </DrawerClose>
        }
      >
        <p>Кардиган</p>
      </Drawer>
      <button type="button">Снаружи</button>
    </>
  );
}

// One press, then wait for the dialog.
async function open(user: User, how: 'click' | 'Enter' | 'Space') {
  const trigger = screen.getByRole('button', { name: 'Корзина' });
  if (how === 'click') await user.click(trigger);
  else {
    trigger.focus();
    await user.keyboard(how === 'Enter' ? '{Enter}' : ' ');
  }
  await screen.findByRole('dialog');
  await vi.waitFor(() =>
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style'),
  );
  return trigger;
}

describe('Drawer', () => {
  it('is closed until the trigger is used', () => {
    render(<Example />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['click', 'Enter', 'Space'] as const)('opens on %s on the trigger', async (how) => {
    const user = setup();
    render(<Example />);

    await open(user, how);

    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toHaveTextContent('Кардиган');
  });

  it('moves the focus inside when it opens', async () => {
    const user = setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await vi.waitFor(() =>
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
    );
    expect(trigger).not.toHaveFocus();
  });

  it('hides the content outside from assistive technology while open', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    expect(screen.queryByRole('button', { name: 'Снаружи' })).not.toBeInTheDocument();
  });

  it('closes on Esc and returns the focus to the trigger', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const trigger = await open(user, 'click');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('closes on the ×', async () => {
    const user = setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on a DrawerClose button in the footer', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Оформить' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can be controlled: open shows it and onOpenChange reports the close request', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open title="Управляемый" wide onOpenChange={onOpenChange}>
        <p>Текст</p>
      </Drawer>,
    );

    expect(await screen.findByRole('dialog', { name: 'Управляемый' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', { name: 'Управляемый' })).toBeInTheDocument();
  });
});
