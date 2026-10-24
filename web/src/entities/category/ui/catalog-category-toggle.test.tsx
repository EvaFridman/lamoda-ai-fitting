import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CatalogCategoryToggle } from './catalog-category-toggle';

function setup(open: boolean, toggleEvents?: { onClick: () => void }) {
  const onOpenChange = vi.fn();
  const view = render(
    <CatalogCategoryToggle
      label="Платья"
      open={open}
      onOpenChange={onOpenChange}
      controls="list-id"
      toggleEvents={toggleEvents}
    />,
  );
  return { onOpenChange, view };
}

describe('CatalogCategoryToggle', () => {
  it('is a button named by the label that points at the list', () => {
    setup(false);
    const button = screen.getByRole('button', { name: 'Платья' });
    expect(button).toHaveAttribute('aria-controls', 'list-id');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('says expanded when open', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Платья' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('swaps the chevron with the state', () => {
    const closed = setup(false);
    const down = screen.getByRole('button').querySelector('svg')!.innerHTML;
    closed.view.unmount();
    setup(true);
    expect(screen.getByRole('button').querySelector('svg')!.innerHTML).not.toBe(down);
  });

  it('asks for the opposite state on a click, after the tracking handler', async () => {
    const order: string[] = [];
    const onClick = vi.fn(() => order.push('events'));
    const { onOpenChange } = setup(false, { onClick });
    onOpenChange.mockImplementation(() => order.push('change'));
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(order).toEqual(['events', 'change']);
  });

  it('asks to close when open', async () => {
    const { onOpenChange } = setup(true);
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
