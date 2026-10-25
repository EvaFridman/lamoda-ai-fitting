import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderLoupe, HeaderSearchRow, HeaderSearchToggleProvider } from './header-search-toggle';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  track: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({ track: mocks.track }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.params,
  usePathname: () => '/page',
}));

function Header() {
  return (
    <HeaderSearchToggleProvider>
      <HeaderLoupe />
      <HeaderSearchRow>
        <input aria-label="Что искать" />
      </HeaderSearchRow>
    </HeaderSearchToggleProvider>
  );
}

const loupe = () => screen.getByRole('button', { name: 'Поиск' });
const row = () => screen.getByRole('textbox', { name: 'Что искать' }).parentElement!;

describe('the phone header search toggle', () => {
  beforeEach(() => {
    mocks.params = new URLSearchParams();
    mocks.track.mockReset();
  });

  it('is closed without a query', () => {
    render(<Header />);
    expect(row()).not.toHaveAttribute('data-open');
    expect(loupe()).toHaveAttribute('aria-expanded', 'false');
  });

  it('is open when the address has a query', () => {
    mocks.params = new URLSearchParams('q=платье');
    render(<Header />);
    expect(row()).toHaveAttribute('data-open');
    expect(loupe()).toHaveAttribute('aria-expanded', 'true');
  });

  it('points the loupe at the row', () => {
    render(<Header />);
    expect(loupe()).toHaveAttribute('aria-controls', row().id);
  });

  it('opens and closes by the loupe, sending the state the click sets', async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(loupe());
    expect(row()).toHaveAttribute('data-open');
    expect(loupe()).toHaveAttribute('aria-expanded', 'true');
    expect(mocks.track).toHaveBeenLastCalledWith('Element Clicked', {
      element: 'header.search',
      zone: 'header',
      type: 'interaction',
      expanded: true,
    });

    await user.click(loupe());
    expect(row()).not.toHaveAttribute('data-open');
    expect(loupe()).toHaveAttribute('aria-expanded', 'false');
    expect(mocks.track).toHaveBeenLastCalledWith('Element Clicked', {
      element: 'header.search',
      zone: 'header',
      type: 'interaction',
      expanded: false,
    });
    expect(mocks.track).toHaveBeenCalledTimes(2);
  });

  it('focuses the field when the loupe opens the row, not when a query does', async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams('q=платье');
    const { unmount } = render(<Header />);
    expect(screen.getByRole('textbox', { name: 'Что искать' })).not.toHaveFocus();
    unmount();

    mocks.params = new URLSearchParams();
    render(<Header />);
    await user.click(loupe());
    expect(screen.getByRole('textbox', { name: 'Что искать' })).toHaveFocus();
  });

  it('does not take the focus when the loupe closes the row', async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams('q=платье');
    render(<Header />);
    await user.click(loupe());
    expect(row()).not.toHaveAttribute('data-open');
    expect(screen.getByRole('textbox', { name: 'Что искать' })).not.toHaveFocus();
  });

  it('keeps the field mounted, with what was typed, while closed', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(loupe());
    await user.type(screen.getByRole('textbox', { name: 'Что искать' }), 'пальто');
    await user.click(loupe());
    expect(row()).not.toHaveAttribute('data-open');
    expect(screen.getByRole('textbox', { name: 'Что искать' })).toHaveValue('пальто');
  });

  it('stays closed for the query it was closed on, and a new query opens it again', async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams('q=платье');
    const { rerender } = render(<Header />);
    await user.click(loupe());
    expect(row()).not.toHaveAttribute('data-open');

    rerender(<Header />);
    expect(row()).not.toHaveAttribute('data-open');

    mocks.params = new URLSearchParams('q=пальто');
    rerender(<Header />);
    expect(row()).toHaveAttribute('data-open');
    expect(loupe()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes when the query goes away', () => {
    mocks.params = new URLSearchParams('q=платье');
    const { rerender } = render(<Header />);
    mocks.params = new URLSearchParams();
    rerender(<Header />);
    expect(row()).not.toHaveAttribute('data-open');
  });
});
