import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as toast from '@/shared/ui';

type ToastModule = Pick<typeof toast, 'showToast'>;

afterEach(() => {
  vi.useRealTimers();
});

function renderProvider() {
  const { ToastProvider } = toast;
  return render(
    <ToastProvider>
      <p>Страница</p>
    </ToastProvider>,
  );
}

function show(...args: Parameters<ToastModule['showToast']>) {
  act(() => {
    toast.showToast(...args);
  });
}

function region() {
  return screen.getByRole('region', { name: 'Уведомления' });
}

// Base UI marks a toast's root as a dialog; a high-priority (error) toast's root is aria-hidden,
// hence `hidden: true`.
function toastRoots() {
  return within(region()).queryAllByRole('dialog', { hidden: true });
}

function toastRoot(title: string) {
  return within(region()).getByText(title).closest('[aria-labelledby]');
}

describe('showToast with ToastProvider', () => {
  it('shows the message inside the region "Уведомления"', async () => {
    renderProvider();

    show({ title: 'Товар добавлен' });

    expect(await within(region()).findByText('Товар добавлен')).toBeInTheDocument();
  });

  it('removes the toast after 5 seconds, not before', async () => {
    vi.useFakeTimers();
    renderProvider();
    show({ title: 'Скоро исчезнет' });
    expect(within(region()).getByText('Скоро исчезнет')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900);
    });
    expect(within(region()).getByText('Скоро исчезнет')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText('Скоро исчезнет')).not.toBeInTheDocument();
  });

  it('removes the toast on the ×', async () => {
    const user = userEvent.setup();
    renderProvider();
    show({ title: 'Закрой меня' });
    await within(region()).findByText('Закрой меня');

    await user.click(within(region()).getByLabelText('Закрыть'));

    await vi.waitFor(() => expect(screen.queryByText('Закрой меня')).not.toBeInTheDocument());
  });

  it('has only the × unless actionLabel is given', async () => {
    renderProvider();
    show({ title: 'Без действия' });
    await within(region()).findByText('Без действия');

    const buttons = within(region()).getAllByRole('button', { hidden: true });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Закрыть');
  });

  it('runs onAction with the action button and closes the toast', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderProvider();
    show({ title: 'Удалено', actionLabel: 'Вернуть', onAction });
    await within(region()).findByText('Удалено');

    await user.click(within(region()).getByRole('button', { name: 'Вернуть' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByText('Удалено')).not.toBeInTheDocument());
  });

  it('closes the toast when the action has no handler', async () => {
    const user = userEvent.setup();
    renderProvider();
    show({ title: 'Без обработчика', actionLabel: 'ОК' });
    await within(region()).findByText('Без обработчика');

    await user.click(within(region()).getByRole('button', { name: 'ОК' }));

    await vi.waitFor(() => expect(screen.queryByText('Без обработчика')).not.toBeInTheDocument());
  });

  it('marks the error tone and announces it urgently', async () => {
    renderProvider();
    show({ title: 'Не удалось сохранить', tone: 'error' });
    await within(region()).findByText('Не удалось сохранить');

    expect(toastRoot('Не удалось сохранить')).toHaveAttribute('data-type', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
  });

  it('marks a default toast as default and does not announce it as an alert', async () => {
    renderProvider();
    show({ title: 'Обычное' });
    await within(region()).findByText('Обычное');

    expect(toastRoot('Обычное')).toHaveAttribute('data-type', 'default');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows at most three toasts at once', async () => {
    renderProvider();
    show({ title: 'Сообщение 1' });
    show({ title: 'Сообщение 2' });
    show({ title: 'Сообщение 3' });
    show({ title: 'Сообщение 4' });
    await within(region()).findByText('Сообщение 4');

    // Base UI keeps the toast over the limit in the DOM, marked, until its own timer ends.
    const visible = toastRoots().filter((root) => !root.hasAttribute('data-limited'));
    expect(visible).toHaveLength(3);
    expect(visible.map((root) => root.textContent)).not.toContain('Сообщение 1');
  });
});

describe('the × of a toast', () => {
  it('is never aria-hidden, so it is found by its role on a freshly shown toast', async () => {
    renderProvider();
    show({ title: 'Свежее' });
    await within(region()).findByText('Свежее');

    expect(within(region()).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });
});

describe('a toast whose action shows another toast', () => {
  function Opener() {
    return (
      <button
        type="button"
        onClick={() =>
          toast.showToast({
            title: 'Удалено',
            actionLabel: 'Вернуть',
            onAction: () => toast.showToast({ title: 'Снова на месте' }),
          })
        }
      >
        Открыть
      </button>
    );
  }

  function renderOpener() {
    const { ToastProvider } = toast;
    return render(
      <ToastProvider>
        <Opener />
      </ToastProvider>,
    );
  }

  it('closes the first toast on Enter and does not drop the focus to the body', async () => {
    const user = userEvent.setup();
    renderOpener();
    const opener = screen.getByRole('button', { name: 'Открыть' });
    opener.focus();
    await user.keyboard('{Enter}');
    await within(region()).findByText('Удалено');

    // F6 enters the region and makes Base UI remember "Открыть" as the place to return to.
    await user.keyboard('{F6}');
    const action = within(region()).getByRole('button', { name: 'Вернуть' });
    for (let i = 0; i < 6 && document.activeElement !== action; i += 1) await user.tab();
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');

    await vi.waitFor(() => expect(screen.queryByText('Удалено')).not.toBeInTheDocument());
    expect(within(region()).getByText('Снова на месте')).toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(opener).toHaveFocus();
  });

  it('lets the follow-up toast go away after 5 seconds', async () => {
    vi.useFakeTimers();
    renderOpener();
    act(() => screen.getByRole('button', { name: 'Открыть' }).click());
    const action = within(region()).getByRole('button', { name: 'Вернуть' });
    // The focus is inside the viewport when the action runs, as for a keyboard user.
    act(() => action.focus());
    act(() => action.click());
    expect(within(region()).getByText('Снова на месте')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(screen.queryByText('Снова на месте')).not.toBeInTheDocument();
  });
});

describe('showToast without ToastProvider', () => {
  it('does not throw', () => {
    expect(() => toast.showToast({ title: 'Некому показать' })).not.toThrow();
  });
});
