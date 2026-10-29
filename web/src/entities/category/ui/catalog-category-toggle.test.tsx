import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CatalogCategoryToggle } from './catalog-category-toggle';

describe('CatalogCategoryToggle', () => {
  it('is a button named by the label, collapsed while closed', () => {
    render(<CatalogCategoryToggle label="Платья" open={false} />);
    const button = screen.getByRole('button', { name: 'Платья' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('says expanded when open', () => {
    render(<CatalogCategoryToggle label="Платья" open />);
    expect(screen.getByRole('button', { name: 'Платья' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('lets the props it is given, the sheet trigger ones, override aria-expanded', () => {
    render(
      <CatalogCategoryToggle label="Платья" open={false} aria-expanded aria-haspopup="dialog" />,
    );
    const button = screen.getByRole('button', { name: 'Платья' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('swaps the chevron with the state', () => {
    const closed = render(<CatalogCategoryToggle label="Платья" open={false} />);
    const down = screen.getByRole('button').querySelector('svg')!.innerHTML;
    closed.unmount();
    render(<CatalogCategoryToggle label="Платья" open />);
    expect(screen.getByRole('button').querySelector('svg')!.innerHTML).not.toBe(down);
  });

  it('passes its click and pointer handlers through and keeps the extra class', async () => {
    const onClick = vi.fn();
    render(
      <CatalogCategoryToggle label="Платья" open={false} onClick={onClick} className="mine" />,
    );
    const button = screen.getByRole('button');
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveClass('mine');
  });
});
