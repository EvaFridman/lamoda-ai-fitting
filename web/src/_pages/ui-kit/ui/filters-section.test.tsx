import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Фильтры' });
}

// The live row is the one with the "Применено" line; the page has an open dropdown of its own, so
// the popup of a chip is found through the chip.
function renderLive() {
  const region = renderRegion();
  const live = within(region).getByText(/^Применено:/).parentElement!;
  const popup = (chip: HTMLElement) => {
    const id = chip.getAttribute('aria-controls');
    return within(document.getElementById(id!)!);
  };
  return { region, live: within(live), popup };
}

describe('filters section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'filters',
      'Фильтры',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows the chip states', () => {
    const region = renderRegion();

    expect(within(region).getByRole('button', { name: 'Стиль вечерний' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Сбросить «Стиль»' })).toBeInTheDocument();
    const toggles = within(region).getAllByRole('button', { name: 'Только со скидкой' });
    expect(toggles.map((toggle) => toggle.getAttribute('aria-pressed')).slice(0, 2)).toEqual([
      'false',
      'true',
    ]);
  });

  it('shows a dropdown open from the start', () => {
    renderRegion();

    expect(screen.getByRole('dialog', { name: 'Стиль' })).toBeInTheDocument();
  });
});

describe('filters demo', () => {
  it('starts with nothing applied and no "Очистить фильтры"', () => {
    const { live } = renderLive();

    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
    expect(live.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
  });

  it('applies a style from the dropdown, and × clears it', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const chip = live.getByRole('button', { name: 'Стиль' });
    await user.click(chip);
    const dropdown = popup(chip);
    await user.click(dropdown.getByRole('checkbox', { name: /Вечерний/ }));
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    expect(live.getByRole('button', { name: 'Стиль вечерний' })).toBeInTheDocument();
    expect(
      live.getByText('Применено: сортировка «Подобрали для вас»; стиль: вечерний'),
    ).toBeInTheDocument();

    await user.click(live.getByRole('button', { name: 'Сбросить «Стиль»' }));
    expect(live.getByRole('button', { name: 'Стиль' })).toBeInTheDocument();
    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
  });

  it('applies a sort on click and closes', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const chip = live.getByRole('button', { name: 'Подобрали для вас' });
    await user.click(chip);
    await user.click(popup(chip).getByRole('radio', { name: 'Сначала дороже' }));

    expect(live.getByRole('button', { name: 'Сначала дороже' })).toBeInTheDocument();
    expect(live.getByText('Применено: сортировка «Сначала дороже»')).toBeInTheDocument();
  });

  it('narrows the brands by search', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const chip = live.getByRole('button', { name: 'Бренд' });
    await user.click(chip);
    const dropdown = popup(chip);
    await user.type(dropdown.getByRole('searchbox', { name: 'Поиск: Бренд' }), 'inn');

    expect(dropdown.getByRole('checkbox', { name: /Innamore/ })).toBeInTheDocument();
    expect(dropdown.queryByRole('checkbox', { name: /Lime/ })).not.toBeInTheDocument();
  });

  it('a non-default sort alone shows "Очистить фильтры"; it resets and focuses the first chip', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const sort = live.getByRole('button', { name: 'Подобрали для вас' });
    await user.click(sort);
    await user.click(popup(sort).getByRole('radio', { name: 'Новинки' }));
    await user.click(live.getByRole('button', { name: 'Очистить фильтры' }));

    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
    expect(live.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    expect(live.getByRole('button', { name: 'Подобрали для вас' })).toHaveFocus();
  });

  it('applies a price from the dropdown, and × clears it', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const chip = live.getByRole('button', { name: 'Цена' });
    await user.click(chip);
    const dropdown = popup(chip);
    await user.type(dropdown.getByRole('textbox', { name: 'Мин. цена' }), '1500');
    await user.type(dropdown.getByRole('textbox', { name: 'Макс. цена' }), '9000');
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    expect(live.getByRole('button', { name: /^Цена от 1\s500 до 9\s000\s₽/ })).toBeInTheDocument();
    expect(
      live.getByText(/^Применено: сортировка «Подобрали для вас»; цена от 1\s500 до 9\s000\s₽$/),
    ).toBeInTheDocument();

    await user.click(live.getByRole('button', { name: 'Сбросить «Цена»' }));
    expect(live.getByRole('button', { name: 'Цена' })).toBeInTheDocument();
    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
  });

  it('"Очистить фильтры" resets the price too', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    const chip = live.getByRole('button', { name: 'Цена' });
    await user.click(chip);
    await user.type(popup(chip).getByRole('textbox', { name: 'Макс. цена' }), '9000');
    await user.click(popup(chip).getByRole('button', { name: 'Применить' }));
    expect(live.getByText(/цена до 9\s000\s₽/)).toBeInTheDocument();

    await user.click(live.getByRole('button', { name: 'Очистить фильтры' }));

    expect(live.getByRole('button', { name: 'Цена' })).toBeInTheDocument();
    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
  });

  it('resets everything with "Очистить фильтры"', async () => {
    const user = userEvent.setup();
    const { live, popup } = renderLive();

    await user.click(live.getByRole('button', { name: 'Только со скидкой' }));
    const brand = live.getByRole('button', { name: 'Бренд' });
    await user.click(brand);
    const brands = popup(brand);
    await user.click(brands.getByRole('checkbox', { name: /Annen/ }));
    await user.click(brands.getByRole('checkbox', { name: /Lime/ }));
    await user.click(brands.getByRole('button', { name: 'Применить' }));
    const sort = live.getByRole('button', { name: 'Подобрали для вас' });
    await user.click(sort);
    await user.click(popup(sort).getByRole('radio', { name: 'Новинки' }));

    expect(
      live.getByText('Применено: сортировка «Новинки»; бренд: Annen, Lime; только со скидкой'),
    ).toBeInTheDocument();

    await user.click(live.getByRole('button', { name: 'Очистить фильтры' }));

    expect(live.getByText('Применено: сортировка «Подобрали для вас»')).toBeInTheDocument();
    expect(live.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    expect(live.getByRole('button', { name: 'Бренд' })).toBeInTheDocument();
    expect(live.getByRole('button', { name: 'Только со скидкой' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
