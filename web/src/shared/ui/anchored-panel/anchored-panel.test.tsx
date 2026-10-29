import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AnchoredPanel } from './anchored-panel';

// Base UI turns pointer events off on the page while a modal is open.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function renderPanel(
  props: Partial<{ open: boolean; footer: React.ReactNode; className: string }> = {},
) {
  const onOpenChange = vi.fn();
  const anchor = createRef<HTMLButtonElement>();
  render(
    <>
      <button ref={anchor} type="button">
        Хотите что-то поменять?
      </button>
      <AnchoredPanel
        title="Что поменять?"
        anchor={anchor}
        open
        onOpenChange={onOpenChange}
        {...props}
      >
        <p>Содержимое</p>
      </AnchoredPanel>
    </>,
  );
  return { onOpenChange };
}

describe('AnchoredPanel', () => {
  it('renders nothing while closed', () => {
    renderPanel({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Содержимое')).not.toBeInTheDocument();
  });

  it('shows a dialog named by the title with the content, the footer and «Закрыть»', async () => {
    renderPanel({ footer: <button type="button">Готово</button> });

    const dialog = await screen.findByRole('dialog', { name: 'Что поменять?' });
    expect(dialog).toHaveTextContent('Содержимое');
    expect(screen.getByRole('button', { name: 'Готово' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });

  it('rises over the anchor: side top, aligned to its start', async () => {
    renderPanel();
    const dialog = await screen.findByRole('dialog');

    expect(dialog.parentElement).toHaveAttribute('data-side', 'top');
    expect(dialog.parentElement).toHaveAttribute('data-align', 'start');
  });

  it('marks the popup and applies the passed class', async () => {
    renderPanel({ className: 'mp-block' });
    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveAttribute('data-anchored-panel');
    expect(dialog).toHaveClass('mp-block');
  });

  it('has no footer wrapper without a footer', async () => {
    renderPanel();
    const dialog = await screen.findByRole('dialog');

    expect(dialog.querySelector('.footer')).toBeNull();
  });

  it('has a footer wrapper with a footer', async () => {
    renderPanel({ footer: <span>Низ</span> });
    const dialog = await screen.findByRole('dialog');

    expect(dialog.querySelector('.footer')).toHaveTextContent('Низ');
  });

  it('asks to close on Escape, on the backdrop and on ×', async () => {
    const user = setup();
    const { onOpenChange } = renderPanel();
    await screen.findByRole('dialog');

    // Base UI passes the change details after the flag.
    const closed = (reason: string) =>
      expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason }));

    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(1));
    closed('escape-key');

    const backdrop = document.querySelector('.backdrop') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(2));
    expect(onOpenChange.mock.lastCall?.[0]).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(3));
    closed('close-press');
  });

  it('gives the focus back to the anchor when it closes', async () => {
    function Controlled() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
            Открыть
          </button>
          <AnchoredPanel title="Панель" anchor={anchorRef} open={open} onOpenChange={setOpen}>
            <p>Содержимое</p>
          </AnchoredPanel>
        </>
      );
    }
    const user = setup();
    render(<Controlled />);
    const button = screen.getByRole('button', { name: 'Открыть' });

    await user.click(button);
    await screen.findByRole('dialog', { name: 'Панель' });
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });
});
