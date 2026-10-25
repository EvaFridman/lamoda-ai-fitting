import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MiniSwatches, type SwatchChoice } from './mini-swatches';

const WHITE = '11111111-1111-4111-8111-111111111111';
const BLACK = '22222222-2222-4222-8222-222222222222';
const COLOURS: SwatchChoice[] = [
  { id: WHITE, value: 'Белый', colorHex: '#FFFFFF' },
  { id: BLACK, value: 'Чёрный', colorHex: null },
];

function setup(value: string | null = WHITE, disabled?: boolean) {
  const onValueChange = vi.fn();
  render(
    <MiniSwatches
      label="Цвет «Рубашка»"
      colours={COLOURS}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    />,
  );
  return onValueChange;
}

describe('MiniSwatches', () => {
  it('is a group named after the item with one button per colour', () => {
    setup();

    const group = screen.getByRole('group', { name: 'Цвет «Рубашка»' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Белый' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Чёрный' })).toBeInTheDocument();
  });

  it('presses only the chosen colour and names it in lower case', () => {
    setup(BLACK);

    expect(screen.getByRole('button', { name: 'Чёрный' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Белый' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('выбран чёрный')).toBeInTheDocument();
  });

  it('names no colour when none is chosen', () => {
    setup(null);

    expect(screen.queryByText(/выбран/)).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('reports the id of the colour clicked', async () => {
    const onValueChange = setup(WHITE);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Чёрный' }));

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(BLACK);
  });

  it('turns every colour off when disabled and reports no click', async () => {
    const onValueChange = setup(WHITE, true);

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Чёрный' }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  describe('events', () => {
    function withEvents(disabled?: boolean) {
      const events = { onPointerEnter: vi.fn(), onPointerLeave: vi.fn() };
      render(
        <MiniSwatches
          label="Цвет «Рубашка»"
          colours={COLOURS}
          value={WHITE}
          onValueChange={vi.fn()}
          disabled={disabled}
          events={events}
        />,
      );
      return events;
    }

    it('starts and ends a hover on the group', async () => {
      const events = withEvents();
      const user = userEvent.setup();

      await user.hover(screen.getByRole('group', { name: 'Цвет «Рубашка»' }));
      expect(events.onPointerEnter).toHaveBeenCalledOnce();
      await user.unhover(screen.getByRole('group', { name: 'Цвет «Рубашка»' }));

      expect(events.onPointerLeave).toHaveBeenCalledOnce();
    });

    it('starts no hover while disabled, but keeps the leave', async () => {
      const events = withEvents(true);
      const user = userEvent.setup();
      const group = screen.getByRole('group', { name: 'Цвет «Рубашка»' });

      await user.hover(group);
      await user.unhover(group);

      expect(events.onPointerEnter).not.toHaveBeenCalled();
      expect(events.onPointerLeave).toHaveBeenCalledOnce();
    });
  });

  it('is on by default', () => {
    setup();

    for (const button of screen.getAllByRole('button')) expect(button).toBeEnabled();
  });
});
