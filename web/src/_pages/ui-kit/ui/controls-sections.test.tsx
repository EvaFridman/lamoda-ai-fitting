import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('fields section', () => {
  it('is in the sections list', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'fields',
      'Поля ввода',
    ]);
  });

  it('shows the empty, filled, hint, error and disabled text fields', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Поля ввода' });

    expect(within(region).getAllByRole('textbox', { name: 'Имя' })).toHaveLength(2);
    expect(within(region).getByRole('textbox', { name: 'Электронная почта' })).toBeInTheDocument();

    const phone = within(region).getByRole('textbox', { name: 'Телефон' });
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(phone).toHaveAccessibleDescription('Неверный формат номера');

    const surnames = within(region).getAllByRole('textbox', { name: 'Фамилия' });
    expect(surnames).toHaveLength(2);
    for (const surname of surnames) expect(surname).toBeDisabled();
  });

  it('shows three static search forms and the live one', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Поля ввода' });

    expect(within(region).getAllByRole('search')).toHaveLength(4);
  });

  it('shows a disabled filled search form', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Поля ввода' });
    const disabled = within(region).getAllByRole('search')[2]!;

    const input = within(disabled).getByRole('searchbox');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('Кроссовки');
    expect(within(disabled).getByRole('button', { name: 'Найти' })).toBeDisabled();
    expect(within(disabled).queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it('shows what the live search would look for', async () => {
    const user = userEvent.setup();
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Поля ввода' });
    const live = within(region).getAllByRole('search').at(-1)!;

    await user.type(within(live).getByRole('searchbox'), 'платье{Enter}');

    expect(within(region).getByText('Ищем: «платье»')).toBeInTheDocument();
  });

  it('renders HTML in the live query as text', async () => {
    const user = userEvent.setup();
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Поля ввода' });
    const live = within(region).getAllByRole('search').at(-1)!;

    await user.type(within(live).getByRole('searchbox'), '<b>x</b>{Enter}');

    expect(within(region).getByText('Ищем: «<b>x</b>»')).toBeInTheDocument();
    expect(region.querySelector('b')).toBeNull();
  });
});
