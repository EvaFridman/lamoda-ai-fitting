import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('controls sections in the sections list', () => {
  it.each([
    ['buttons', 'Кнопки'],
    ['links', 'Ссылки'],
    ['spinner', 'Спиннер'],
  ])('has %s / %s', (id, title) => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([id, title]);
  });
});

describe('buttons section', () => {
  it('shows disabled and loading examples of every variant', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    const busy = within(region)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-busy') === 'true');
    expect(busy).toHaveLength(3);

    const disabled = within(region)
      .getAllByRole('button')
      .filter((button) => (button as HTMLButtonElement).disabled);
    // three disabled Buttons and one disabled IconButton
    expect(disabled).toHaveLength(4);
    expect(within(region).getByRole('button', { name: 'Нет в наличии' })).toBeDisabled();
  });

  it('shows every size and the three variants', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    for (const props of ['primary', 'secondary', 'outline', 'size 56', 'size 48', 'size 40']) {
      expect(within(region).getAllByText(props, { selector: 'code' }).length).toBeGreaterThan(0);
    }
    expect(within(region).getByText('size 32 · textSize body-s')).toBeInTheDocument();
  });

  it('shows icon buttons named "Добавить в избранное"', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    // size 48, size 56, disabled, and the one beside "Добавить в корзину"
    expect(within(region).getAllByRole('button', { name: 'Добавить в избранное' })).toHaveLength(4);
  });

  it('shows a button-looking link "Оценить товары · 1"', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    expect(within(region).getByRole('link', { name: 'Оценить товары · 1' })).toHaveAttribute(
      'href',
      '#buttons',
    );
  });

  it('shows a full-width button and the live loading example', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    expect(within(region).getByRole('button', { name: 'Показать ещё' })).toHaveClass('fullWidth');
    expect(within(region).getAllByRole('button', { name: 'Добавить в корзину' }).length).toBe(4);
  });
});

describe('links section', () => {
  it('shows both variants in 16px and 13px text', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Ссылки' });

    const primary = within(region).getAllByRole('link', { name: 'Таблица размеров' });
    const secondary = within(region).getAllByRole('link', { name: 'Условия возврата' });
    expect(primary).toHaveLength(2);
    expect(secondary).toHaveLength(2);
    for (const link of primary) expect(link).toHaveClass('primary');
    for (const link of secondary) expect(link).toHaveClass('secondary');
  });
});

describe('spinner section', () => {
  it('shows a 24px and a 64px spinner', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Спиннер' });

    const spinners = within(region).getAllByRole('progressbar', { name: 'Загрузка' });
    expect(spinners).toHaveLength(2);
    expect(spinners[0]).toHaveClass('size24');
    expect(spinners[1]).toHaveClass('size64');
  });
});
