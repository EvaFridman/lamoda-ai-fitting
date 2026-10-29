import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COARSE_POINTER_QUERY } from '@/shared/config';
import { InfoTip } from '@/shared/ui';

const TEXT = 'Изображение приблизительное.';

function Example() {
  return (
    <>
      <p>
        Строка
        <InfoTip aria-label="Об изображении" content={TEXT} />
      </p>
      <button type="button">Снаружи</button>
    </>
  );
}

describe('InfoTip with a mouse', () => {
  it('is a button with the given name and a hidden text', () => {
    render(<Example />);

    expect(screen.getByRole('button', { name: 'Об изображении' })).toBeInTheDocument();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it('describes the button with the hint for screen readers', () => {
    render(<Example />);

    const button = screen.getByRole('button', { name: 'Об изображении' });
    expect(button).toHaveAttribute('aria-description', TEXT);
    expect(button).toHaveAccessibleDescription(TEXT);
  });

  it('shows the text on hover', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.hover(screen.getByRole('button', { name: 'Об изображении' }));

    expect(await screen.findByText(TEXT)).toBeInTheDocument();
  });

  describe('hover delay (spec 0024 Z39)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens the hint after about 100 ms of rest, not before', async () => {
      vi.useFakeTimers();
      render(<Example />);

      const trigger = screen.getByRole('button', { name: 'Об изображении' });
      fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
      fireEvent.mouseMove(trigger);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.queryByText(TEXT)).not.toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(screen.getByText(TEXT)).toBeInTheDocument();
    });
  });

  it('shows the text on keyboard focus and hides it on Esc', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Об изображении' })).toHaveFocus();
    expect(await screen.findByText(TEXT)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByText(TEXT)).not.toBeInTheDocument());
  });
});

describe('InfoTip under a finger', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCoarse() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === COARSE_POINTER_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  it('opens a named dialog with the text on a tap', async () => {
    stubCoarse();
    const user = userEvent.setup();
    render(<Example />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Об изображении' }));

    expect(await screen.findByRole('dialog', { name: 'Об изображении' })).toHaveTextContent(TEXT);
  });

  it('needs no description on the button: the dialog carries the text', () => {
    stubCoarse();
    render(<Example />);

    expect(screen.getByRole('button', { name: 'Об изображении' })).not.toHaveAttribute(
      'aria-description',
    );
  });

  it('closes on a click outside', async () => {
    stubCoarse();
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Об изображении' }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Снаружи' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on Esc and returns the focus to the «!»', async () => {
    stubCoarse();
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Об изображении' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
