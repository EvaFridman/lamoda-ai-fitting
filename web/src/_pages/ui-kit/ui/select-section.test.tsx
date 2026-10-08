import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

// Base UI ignores an open that comes soon after another popup closed, so the opening is retried
// until the list is there and the focus has moved into it.
async function openWithEnter(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      trigger.focus();
      await user.keyboard('{Enter}');
    }
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  await vi.waitFor(() => expect(trigger).not.toHaveFocus());
}

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Выпадающий список' });
}

describe('select section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'select',
      'Выпадающий список',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows the placeholder, thumbnail and disabled states, all closed', () => {
    const region = renderRegion();

    const placeholder = within(region).getByRole('combobox', { name: 'Размер: по умолчанию' });
    expect(placeholder).toHaveTextContent('Выберите размер');

    const thumbnail = within(region).getByRole('combobox', { name: 'Цвет: с миниатюрой' });
    expect(thumbnail).toHaveTextContent('Белый');

    const disabled = within(region).getByRole('combobox', { name: 'Размер: disabled' });
    expect(disabled).toHaveAttribute('data-disabled');
  });

  it('has no select open on render', () => {
    const region = renderRegion();

    expect(within(region).queryByRole('combobox', { name: 'Размер: открытый список' })).toBeNull();
    for (const select of within(region).getAllByRole('combobox')) {
      expect(select).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('opens a static example with the keyboard', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const select = within(region).getByRole('combobox', { name: 'Размер: по умолчанию' });

    await openWithEnter(user, select);

    expect(select).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('select demo', () => {
  it('starts with white and no size', () => {
    const region = renderRegion();

    expect(within(region).getByText('Цвет: Белый, размер: не выбран')).toBeInTheDocument();
  });

  it('shows the picks made with the keyboard', async () => {
    const user = userEvent.setup();
    const region = renderRegion();

    const color = within(region).getByRole('combobox', { name: 'Цвет' });
    await openWithEnter(user, color);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(within(region).getByText('Цвет: Черный, размер: не выбран')).toBeInTheDocument();
    expect(color).toHaveFocus();

    const size = within(region).getByRole('combobox', { name: 'Размер' });
    await openWithEnter(user, size);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(within(region).getByText('Цвет: Черный, размер: 42/44 RUS (S)')).toBeInTheDocument();
    expect(size).toHaveFocus();
  });
});
