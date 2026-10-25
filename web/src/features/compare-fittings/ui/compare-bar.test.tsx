import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompareSelection } from '../model/use-compare-selection';
import { CompareBar } from './compare-bar';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

// jsdom cannot navigate: the link is a plain anchor whose click is cancelled.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({
      onClick,
      ...props
    }: {
      href: string;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement('a', {
        ...props,
        onClick: (event: { preventDefault: () => void }) => {
          onClick?.(event);
          event.preventDefault();
        },
      }),
  };
});

function selection(patch: Partial<CompareSelection> = {}): CompareSelection {
  return {
    active: false,
    ids: [],
    start: vi.fn(),
    cancel: vi.fn(),
    toggle: vi.fn(),
    ...patch,
  };
}

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  mocks.track.mockReset();
});

describe('CompareBar before the selection', () => {
  it('shows nothing when fewer than two results can be compared', () => {
    const { container } = render(
      <CompareBar selection={selection()} phone={false} available={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows «Сравнить» on a wide screen, which starts the selection and is tracked', async () => {
    const current = selection();
    render(<CompareBar selection={current} phone={false} available />);

    await setup().click(screen.getByRole('button', { name: 'Сравнить' }));

    expect(current.start).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'history.compare', zone: 'fitting', from: 'button' }),
    );
  });

  it('shows an icon button named «Сравнить» on a phone, with the same effect', async () => {
    const current = selection();
    render(<CompareBar selection={current} phone available />);

    await setup().click(screen.getByRole('button', { name: 'Сравнить' }));

    expect(current.start).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'history.compare', from: 'button' }),
    );
  });
});

describe('CompareBar in the selection mode', () => {
  it('counts the chosen and disables «Сравнить» until two are chosen', () => {
    render(
      <CompareBar selection={selection({ active: true, ids: ['a'] })} phone={false} available />,
    );
    expect(screen.getByText('Выбрано 1 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сравнить' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Сравнить' })).not.toBeInTheDocument();
  });

  it('shows «Выбрано 0 из 2» with nothing chosen', () => {
    render(<CompareBar selection={selection({ active: true })} phone={false} available />);
    expect(screen.getByText('Выбрано 0 из 2')).toBeInTheDocument();
  });

  it('turns «Сравнить» into a link to the compare page with both ids once two are chosen', async () => {
    render(
      <CompareBar
        selection={selection({ active: true, ids: ['aa', 'bb'] })}
        phone={false}
        available
      />,
    );
    expect(screen.getByText('Выбрано 2 из 2')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Сравнить' });
    expect(link).toHaveAttribute('href', '/customer/fittings/compare?a=aa&b=bb');

    await setup().click(link);

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'history.compare-open', zone: 'fitting' }),
    );
  });

  it('«Отмена» cancels the selection', async () => {
    const current = selection({ active: true, ids: ['a'] });
    render(<CompareBar selection={current} phone={false} available />);

    await setup().click(screen.getByRole('button', { name: 'Отмена' }));

    expect(current.cancel).toHaveBeenCalledOnce();
  });

  it('stays visible in the selection mode even when not available', () => {
    render(<CompareBar selection={selection({ active: true })} phone available={false} />);
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });
});
