import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button, Modal, ModalClose } from '@/shared/ui';

type User = ReturnType<typeof userEvent.setup>;

// Base UI turns pointer events off on the page while a modal is open and the styles that give them
// back to the dialog are not loaded in jsdom, so user-event's pointer-events check is off.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function TwoButtons({ useInitialFocus }: { useInitialFocus: boolean }) {
  const secondRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      trigger={<Button>Удалить</Button>}
      title="Удалить товар?"
      initialFocus={useInitialFocus ? secondRef : undefined}
    >
      <Button>Первая</Button>
      <Button ref={secondRef}>Вторая</Button>
    </Modal>
  );
}

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <Modal
        trigger={<Button>Удалить</Button>}
        title="Удалить товар?"
        description="Кардиган, 44/46 RUS"
        onOpenChange={onOpenChange}
        footer={
          <ModalClose>
            <Button>Отмена</Button>
          </ModalClose>
        }
      >
        <p>Содержимое</p>
      </Modal>
      <button type="button">Снаружи</button>
    </>
  );
}

// One press, then wait for the dialog.
async function open(user: User, how: 'click' | 'Enter' | 'Space') {
  const trigger = screen.getByRole('button', { name: 'Удалить' });
  if (how === 'click') await user.click(trigger);
  else {
    trigger.focus();
    await user.keyboard(how === 'Enter' ? '{Enter}' : ' ');
  }
  await screen.findByRole('dialog');
  // The enter transition has ended once the starting style is gone; before that the dialog's
  // controls ignore the pointer.
  await vi.waitFor(() =>
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style'),
  );
  return trigger;
}

describe('Modal', () => {
  it('is closed until the trigger is used', () => {
    render(<Example />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['click', 'Enter', 'Space'] as const)('opens on %s on the trigger', async (how) => {
    const user = setup();
    render(<Example />);

    await open(user, how);

    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('is a dialog named by its title and described by its description', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    const dialog = screen.getByRole('dialog', { name: 'Удалить товар?' });
    expect(dialog).toHaveAccessibleDescription('Кардиган, 44/46 RUS');
    expect(dialog).toHaveTextContent('Содержимое');
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

  it('focuses the first focusable element by default', async () => {
    const user = setup();
    render(<TwoButtons useInitialFocus={false} />);
    await open(user, 'click');

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Первая' })).toHaveFocus());
  });

  it('focuses the element given as initialFocus when it opens', async () => {
    const user = setup();
    render(<TwoButtons useInitialFocus />);
    await open(user, 'click');

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Вторая' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Первая' })).not.toHaveFocus();
  });

  it("focuses the dialog itself with initialFocus='popup', not its first button", async () => {
    const user = setup();
    render(
      <Modal trigger={<Button>Удалить</Button>} title="Рамка" initialFocus="popup">
        <Button>Первая</Button>
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    const dialog = await screen.findByRole('dialog', { name: 'Рамка' });
    await vi.waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Первая' })).not.toHaveFocus();
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

  it('closes on the × and returns the focus to the trigger', async () => {
    const user = setup();
    render(<Example />);
    const trigger = await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on a ModalClose button in the footer', async () => {
    const user = setup();
    render(<Example />);
    await open(user, 'click');

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can be controlled: open shows it and onOpenChange reports the close request', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Modal open title="Управляемое" onOpenChange={onOpenChange}>
        <p>Текст</p>
      </Modal>,
    );

    expect(await screen.findByRole('dialog', { name: 'Управляемое' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', { name: 'Управляемое' })).toBeInTheDocument();
  });

  it('renders media before its heading, inside the dialog', async () => {
    render(
      <Modal
        open
        title="Фото не подходит"
        media={<span role="img" aria-label="Загруженное фото" />}
      >
        <p>Текст</p>
      </Modal>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Фото не подходит' });
    const image = within(dialog).getByRole('img', { name: 'Загруженное фото' });
    const heading = within(dialog).getByText('Фото не подходит');
    expect(image.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['false', false],
    ['null', null],
  ])('renders no media column for media={%s}', async (_label, media) => {
    render(
      <Modal open title="Без картинки" media={media}>
        <p>Текст</p>
      </Modal>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Без картинки' });
    expect(dialog.firstElementChild).toBe(within(dialog).getByText('Без картинки'));
    expect(dialog).not.toHaveClass('withMedia');
  });

  it('renders no media without it, and still opens when wide', async () => {
    render(
      <Modal open wide title="Широкое">
        <p>Текст</p>
      </Modal>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Широкое' });
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Текст');
  });

  it('marks the outer dialog while a nested one is open, so its × can be hidden', async () => {
    const user = setup();
    render(
      <Modal open title="Внешнее">
        <Modal trigger={<Button>Вложенное</Button>} title="Внутреннее">
          <p>Текст</p>
        </Modal>
      </Modal>,
    );
    const outer = await screen.findByRole('dialog', { name: 'Внешнее' });
    expect(outer).not.toHaveAttribute('data-nested-dialog-open');

    await user.click(screen.getByRole('button', { name: 'Вложенное' }));

    await screen.findByRole('dialog', { name: 'Внутреннее' });
    expect(outer).toHaveAttribute('data-nested-dialog-open');
    // The rule `.popup[data-nested-dialog-open] > .close` needs the × to be a direct child.
    const close = outer.querySelector('button[aria-label="Закрыть"]');
    expect(close).toHaveClass('close');
    expect(close?.parentElement).toBe(outer);
  });

  it('stays closed while controlled open is false', () => {
    render(<Modal open={false} title="Закрытое" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
