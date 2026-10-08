import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Чекбоксы, радиокнопки, переключатели' });
}

describe('choice section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'choice',
      'Чекбоксы, радиокнопки, переключатели',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows the four checkbox states', () => {
    const region = renderRegion();

    const boxes = within(region).getAllByRole('checkbox', { name: 'Хлопок' });
    // the four static examples, plus the one in the live group
    expect(boxes.filter((box) => box.hasAttribute('data-disabled'))).toHaveLength(2);
    expect(boxes.filter((box) => (box as HTMLElement).ariaChecked === 'true')).toHaveLength(2);
    for (const caption of ['по умолчанию', 'checked', 'disabled', 'disabled · checked']) {
      expect(within(region).getAllByText(caption, { selector: 'code' }).length).toBe(3);
    }
  });

  it('shows the four radio states, each in its own named group', () => {
    const region = renderRegion();

    for (const props of ['по умолчанию', 'checked', 'disabled', 'disabled · checked']) {
      const group = within(region).getByRole('radiogroup', { name: `Радиокнопка: ${props}` });
      const radio = within(group).getByRole('radio', { name: 'Новинки' });
      expect(radio).toHaveAttribute(
        'aria-checked',
        props === 'checked' || props === 'disabled · checked' ? 'true' : 'false',
      );
      expect(radio.hasAttribute('data-disabled')).toBe(props.startsWith('disabled'));
    }
  });

  it('shows the four switch states', () => {
    const region = renderRegion();

    const switches = within(region).getAllByRole('switch', { name: 'Только со скидкой' });
    expect(switches).toHaveLength(4);
    expect(switches.map((control) => control.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'true',
    ]);
    expect(switches.map((control) => control.hasAttribute('data-disabled'))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('toggles a static switch', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const first = within(region).getAllByRole('switch', { name: 'Только со скидкой' })[0]!;

    await user.click(first);

    expect(first).toBeChecked();
  });
});

describe('checkbox group demo', () => {
  it('starts with "wool" picked and a disabled option', () => {
    const region = renderRegion();
    const group = within(region).getByRole('group', { name: 'Материал' });

    expect(within(group).getByRole('checkbox', { name: 'Шерсть' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Лён' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(region).getByText('Выбрано: wool')).toBeInTheDocument();
  });

  it('updates the picked values on interaction and says when none are picked', async () => {
    const user = userEvent.setup();
    const region = renderRegion();

    const group = within(region).getByRole('group', { name: 'Материал' });

    await user.click(within(group).getByText('Хлопок'));
    expect(within(region).getByText('Выбрано: wool, cotton')).toBeInTheDocument();

    await user.click(within(group).getByRole('checkbox', { name: 'Шерсть' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Хлопок' }));
    expect(within(region).getByText('Ничего не выбрано')).toBeInTheDocument();
  });

  it('does not pick the disabled option', async () => {
    const user = userEvent.setup();
    const region = renderRegion();

    await user.click(within(region).getByText('Лён'));

    expect(within(region).getByText('Выбрано: wool')).toBeInTheDocument();
  });
});

describe('radio group demo', () => {
  it('starts on "popular"', () => {
    const region = renderRegion();
    const group = within(region).getByRole('radiogroup', { name: 'Сортировка' });

    expect(within(group).getByRole('radio', { name: 'Подобрали для вас' })).toBeChecked();
    expect(within(region).getByText('Выбрано: popular')).toBeInTheDocument();
  });

  it('shows the pick after a click and after the arrow keys', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const group = within(region).getByRole('radiogroup', { name: 'Сортировка' });

    await user.click(within(group).getByText('Сначала дороже'));
    expect(within(region).getByText('Выбрано: price-desc')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(within(region).getByText('Выбрано: price-asc')).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Сначала дешевле' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(within(region).getByText('Выбрано: price-desc')).toBeInTheDocument();
  });
});
