import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('fitting sections in the sections list', () => {
  it.each([
    ['chips', 'Чипы'],
    ['progress', 'Прогресс'],
  ])('has %s', (id) => {
    expect(sections.map((section) => section.id)).toContain(id);
  });
});

describe('chips section', () => {
  it('shows the live group and the three states', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', {
      name: sections.find((s) => s.id === 'chips')!.title,
    });

    expect(within(region).getByRole('group', { name: 'Что поменять?' })).toBeInTheDocument();
    const pressed = within(region).getByRole('group', { name: 'Нажатый' });
    expect(within(pressed).getByRole('button', { name: 'Вещь' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const disabled = within(region).getByRole('group', { name: 'Недоступный' });
    expect(within(disabled).getByRole('button', { name: 'Фон' })).toBeDisabled();
    const plain = within(region).getByRole('group', { name: 'Обычный' });
    expect(within(plain).getByRole('button', { name: 'Лицо' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('progress section', () => {
  it('shows bars of 0, 64 and 100', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', {
      name: sections.find((s) => s.id === 'progress')!.title,
    });

    const bars = within(region).getAllByRole('progressbar', { name: 'Примерка' });
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['0', '64', '100']);
  });

  it('shows the counter for 3 and 5 only', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', {
      name: sections.find((s) => s.id === 'progress')!.title,
    });

    expect(within(region).getByText('3', { selector: 'span' })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(within(region).getByText('5', { selector: 'span' })).toBeInTheDocument();
    expect(within(region).queryByText('0', { selector: 'span' })).not.toBeInTheDocument();
  });
});

describe('buttons section: Примерить', () => {
  it('shows a plain, a busy and a disabled button', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Кнопки' });

    const buttons = within(region).getAllByRole('button', { name: 'Примерить' });
    expect(buttons).toHaveLength(3);
    expect(buttons.filter((b) => b.getAttribute('aria-busy') === 'true')).toHaveLength(1);
    expect(buttons.filter((b) => (b as HTMLButtonElement).disabled).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      buttons.filter(
        (b) => b.getAttribute('aria-busy') !== 'true' && !(b as HTMLButtonElement).disabled,
      ),
    ).toHaveLength(1);
  });
});
