import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button, Sheet, SheetClose } from '@/shared/ui';

// Base UI turns pointer events off on the page while a sheet is open and the styles that give them
// back to it are not loaded in jsdom, so user-event's pointer-events check is off.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Sheet
      trigger={<Button>Удалить фото</Button>}
      title="Удалить фото?"
      description="Фото и его копии удалятся."
      media={<span role="img" aria-label="Фото 2" />}
      onOpenChange={onOpenChange}
      initialFocus={cancelRef}
      footer={
        <>
          <Button>Удалить</Button>
          <SheetClose>
            <Button ref={cancelRef} variant="outline">
              Отмена
            </Button>
          </SheetClose>
        </>
      }
    >
      <p>Содержимое</p>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('is closed until the trigger is used', () => {
    render(<Example />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens from the trigger as a dialog with its title, description, media, content and footer', async () => {
    const user = setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Удалить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' });
    expect(dialog).toHaveAccessibleDescription('Фото и его копии удалятся.');
    expect(within(dialog).getByRole('img', { name: 'Фото 2' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Содержимое');
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Удалить', 'Отмена']);
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
  });

  it('focuses initialFocus when it opens', async () => {
    const user = setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Удалить фото' }));

    const dialog = await screen.findByRole('dialog');
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus(),
    );
  });

  it('SheetClose closes it, reports the change and returns the focus to the trigger', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Удалить фото' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus(),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'close-press');
    expect(trigger).toHaveFocus();
  });

  it('closes on Esc', async () => {
    const user = setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Удалить фото' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can be controlled: open shows it and Esc only reports the request', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <Sheet open title="Управляемое" onOpenChange={onOpenChange}>
        <p>Текст</p>
      </Sheet>,
    );

    expect(await screen.findByRole('dialog', { name: 'Управляемое' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false, 'escape-key');
    expect(screen.getByRole('dialog', { name: 'Управляемое' })).toBeInTheDocument();
  });

  it.each([
    ['false', false],
    ['null', null],
  ])('renders no media column for media={%s}', async (_label, media) => {
    render(<Sheet open title="Без картинки" media={media} />);

    const dialog = await screen.findByRole('dialog', { name: 'Без картинки' });
    const heading = within(dialog).getByText('Без картинки');
    // No media wrapper: the heading's row sits right after the grip, directly in the dialog.
    const row = heading.parentElement!;
    expect(row.parentElement).toBe(dialog);
    expect(row.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
  });

  it('has a decorative grip at the top and no ×', async () => {
    render(<Sheet open title="С ручкой" />);

    const dialog = await screen.findByRole('dialog', { name: 'С ручкой' });
    const grip = dialog.firstElementChild!;
    expect(grip.tagName).toBe('SPAN');
    expect(grip).toHaveAttribute('aria-hidden', 'true');
    expect(grip).toBeEmptyDOMElement();
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
  });

  it('stays closed while controlled open is false', () => {
    render(<Sheet open={false} title="Закрытое" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
