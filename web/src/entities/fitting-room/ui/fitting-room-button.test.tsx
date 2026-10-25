import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FittingRoomButton, fittingRoomLabel } from './fitting-room-button';

describe('fittingRoomLabel', () => {
  it('is the bare name at zero', () => {
    expect(fittingRoomLabel(0)).toBe('Примерочная');
  });

  it.each([
    [1, 'Примерочная, 1 вещь'],
    [2, 'Примерочная, 2 вещи'],
    [3, 'Примерочная, 3 вещи'],
    [4, 'Примерочная, 4 вещи'],
    [5, 'Примерочная, 5 вещей'],
  ])('says %i in words', (count, label) => {
    expect(fittingRoomLabel(count)).toBe(label);
  });
});

describe('FittingRoomButton', () => {
  it('is named «Примерочная» with no counter when the room is empty', () => {
    render(<FittingRoomButton count={0} />);

    const button = screen.getByRole('button', { name: 'Примерочная' });
    expect(button).toHaveTextContent('');
  });

  it('names the count and shows it as a number', () => {
    render(<FittingRoomButton count={3} />);

    const button = screen.getByRole('button', { name: 'Примерочная, 3 вещи' });
    expect(button).toHaveTextContent('3');
  });

  it('hands its handlers to the button', async () => {
    const onClick = vi.fn();
    render(<FittingRoomButton count={2} onClick={onClick} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Примерочная, 2 вещи' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('passes aria-disabled through for the header’s inert state', () => {
    render(<FittingRoomButton count={0} aria-disabled="true" />);

    const button = screen.getByRole('button', { name: 'Примерочная' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('type', 'button');
  });
});
