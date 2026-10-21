import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { catalogFacets } from '../config/catalog';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Фильтры каталога' });
}

// The region holds two demos with the same names (the chips, then the phone panels): the chips'
// is the block under the first heading.
function renderChipsDemo() {
  const region = renderRegion();
  const heading = within(region).getByRole('heading', { name: /^ProductSortFilter, ColorFilter/ });
  return heading.nextElementSibling as HTMLElement;
}

// The popup of a chip is found through the chip: Base UI portals it out of the region.
function renderLive() {
  const region = renderChipsDemo();
  const popup = (chip: HTMLElement) => {
    const id = chip.getAttribute('aria-controls');
    return within(document.getElementById(id!)!);
  };
  const open = async (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => {
    const chip = within(region).getByRole('button', { name });
    await user.click(chip);
    return popup(chip);
  };
  const lastCall = (text: string) =>
    expect(within(region).getByText(`Последний вызов: ${text}`)).toBeInTheDocument();
  return { region, popup, open, lastCall };
}

const facetId = (group: 'brands' | 'categories', name: string) =>
  catalogFacets[group].find((item) => item.name === name)!.id;

const colourId = (value: string) =>
  catalogFacets.attributes
    .find((attribute) => attribute.name === 'Цвет')!
    .values.find((item) => item.value === value)!.id;

describe('catalog filters section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'catalog-filters',
      'Фильтры каталога',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows all the chips and no last call or "Очистить фильтры" at the start', () => {
    const { region } = renderLive();

    for (const name of ['Новинки', 'Цвет', 'Материал', 'Сезон', 'Бренд', 'Размер', 'Цена']) {
      expect(within(region).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(region).getByRole('button', { name: 'Только со скидкой' })).toBeInTheDocument();
    expect(within(region).getByText('Последний вызов: —')).toBeInTheDocument();
    expect(
      within(region).queryByRole('button', { name: 'Очистить фильтры' }),
    ).not.toBeInTheDocument();
  });

  it('lists the colours with names and counts, and "разноцветный" with no swatch', async () => {
    const user = userEvent.setup();
    const { open } = renderLive();

    const dropdown = await open(user, 'Цвет');

    expect(dropdown.getAllByRole('checkbox')).toHaveLength(11);
    const white = dropdown.getByRole('checkbox', { name: /^белый/ });
    expect(white.closest('label')).toHaveTextContent(/белый\s*5/);
    expect(white.style.background).not.toBe('');
    const multicolour = dropdown.getByRole('checkbox', { name: /^разноцветный/ });
    expect(multicolour.closest('label')).toHaveTextContent(/разноцветный\s*2/);
    expect(multicolour.style.background).toBe('');
  });

  it('applies two colours and reports both ids', async () => {
    const user = userEvent.setup();
    const { open, lastCall } = renderLive();

    const dropdown = await open(user, 'Цвет');
    await user.click(dropdown.getByRole('checkbox', { name: /^синий/ }));
    await user.click(dropdown.getByRole('checkbox', { name: /^белый/ }));
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    lastCall(`ColorFilter onApply: ${JSON.stringify([colourId('белый'), colourId('синий')])}`);
  });

  it('has material and season chips that list their values', async () => {
    const user = userEvent.setup();
    const { open } = renderLive();

    const material = await open(user, 'Материал');
    expect(material.getByRole('checkbox', { name: /хлопок/ })).toBeInTheDocument();
    expect(material.getAllByRole('checkbox')).toHaveLength(6);
    await user.keyboard('{Escape}');

    const season = await open(user, 'Сезон');
    expect(season.getByRole('checkbox', { name: /демисезон/ })).toBeInTheDocument();
    expect(season.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('reports a chosen material through AttributeFilter', async () => {
    const user = userEvent.setup();
    const { open, lastCall } = renderLive();

    const dropdown = await open(user, 'Материал');
    await user.click(dropdown.getByRole('checkbox', { name: /лён/ }));
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    lastCall('AttributeFilter onApply: ["01a1187a-a500-72b7-b2fd-756136dc5e34"]');
  });

  it('finds a brand by part of its name and reports its id', async () => {
    const user = userEvent.setup();
    const { open, lastCall } = renderLive();

    const dropdown = await open(user, 'Бренд');
    await user.type(dropdown.getByRole('searchbox', { name: 'Поиск: Бренд' }), 'ris');

    expect(dropdown.getAllByRole('checkbox')).toHaveLength(1);
    await user.click(dropdown.getByRole('checkbox', { name: /Brisko/ }));
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    lastCall(`BrandFilter onApply: ${JSON.stringify([facetId('brands', 'Brisko')])}`);
  });

  it('lists the sizes in clothing order', async () => {
    const user = userEvent.setup();
    const { open } = renderLive();

    const dropdown = await open(user, 'Размер');

    const sizes = dropdown
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')!.textContent!.split(/\s/)[0]);
    expect(sizes).toEqual(['XS', 'S', 'M', 'L', 'XL', '26', '28', '30', '32', '34']);
  });

  it('starts the price filter from the bounds and reports the chosen range', async () => {
    const user = userEvent.setup();
    const { open, lastCall } = renderLive();

    const dropdown = await open(user, 'Цена');
    expect(dropdown.getByRole('textbox', { name: 'Мин. цена' })).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/^990$/),
    );
    expect(dropdown.getByRole('textbox', { name: 'Макс. цена' })).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/^18\s990$/),
    );

    await user.type(dropdown.getByRole('textbox', { name: 'Мин. цена' }), '1500');
    await user.click(dropdown.getByRole('button', { name: 'Применить' }));

    lastCall('PriceRangeFilter onApply: [1500,18990]');
  });

  it('toggles the discount chip and reports the value', async () => {
    const user = userEvent.setup();
    const { region, lastCall } = renderLive();

    const chip = within(region).getByRole('button', { name: 'Только со скидкой' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    lastCall('DiscountFilter onCheckedChange: true');
  });

  it('lists five sorts in Russian and reports the chosen one', async () => {
    const user = userEvent.setup();
    const { open, region, lastCall } = renderLive();

    const dropdown = await open(user, 'Новинки');
    expect(
      dropdown.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent),
    ).toEqual([
      'Новинки',
      'Сначала дороже',
      'Сначала дешевле',
      'По величине скидки',
      'По рейтингу',
    ]);
    await user.click(dropdown.getByRole('radio', { name: 'Сначала дешевле' }));

    lastCall('ProductSortFilter onValueChange: "price_asc"');
    expect(within(region).getByRole('button', { name: 'Сначала дешевле' })).toBeInTheDocument();
  });

  it('lists each category with its count, none chosen', () => {
    const { region } = renderLive();

    const nav = within(region).getByRole('navigation', { name: 'Категории' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Платья 5',
      'Джинсы 5',
      'Верхняя одежда 5',
      'Футболки 5',
      'Толстовки и худи 5',
      'Обувь 5',
    ]);
    for (const link of links) expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks a clicked category, reports its id and keeps the URL hash', async () => {
    const user = userEvent.setup();
    const { region, lastCall } = renderLive();
    const hash = window.location.hash;

    const nav = within(region).getByRole('navigation', { name: 'Категории' });
    await user.click(within(nav).getByRole('link', { name: /^Джинсы/ }));

    expect(within(nav).getByRole('link', { name: /^Джинсы/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(1);
    lastCall(`CatalogCategoryList value: ${JSON.stringify(facetId('categories', 'Джинсы'))}`);
    expect(window.location.hash).toBe(hash);
  });

  // next/link navigates in its own onClick unless the event is already defaultPrevented, and jsdom
  // has no router to show it: so the click must be prevented before it reaches the link itself.
  it('prevents a category click before it reaches the link', async () => {
    const user = userEvent.setup();
    const { region } = renderLive();

    const nav = within(region).getByRole('navigation', { name: 'Категории' });
    const link = within(nav).getByRole('link', { name: /^Джинсы/ });
    let preventedAtLink: boolean | undefined;
    link.addEventListener('click', (event) => {
      preventedAtLink = event.defaultPrevented;
    });
    await user.click(link);

    expect(preventedAtLink).toBe(true);
  });

  it('shows "Очистить фильтры" once something is applied, and clears it', async () => {
    const user = userEvent.setup();
    const { region, lastCall } = renderLive();

    const discount = within(region).getByRole('button', { name: 'Только со скидкой' });
    await user.click(discount);
    await user.click(within(region).getByRole('button', { name: 'Очистить фильтры' }));

    expect(discount).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(region).queryByRole('button', { name: 'Очистить фильтры' }),
    ).not.toBeInTheDocument();
    lastCall('FilterChips onClearAll');
  });

  // "Очистить фильтры" for a checkbox filter (the others share the colour's component) and for the
  // price, one test each: a dropdown costs up to 2 s on CI and a test has 5 s.
  it('clears applied colours back to a bare chip and an unticked dropdown', async () => {
    const user = userEvent.setup();
    const { region, open } = renderLive();

    const colours = await open(user, 'Цвет');
    await user.click(colours.getByRole('checkbox', { name: /^синий/ }));
    await user.click(colours.getByRole('checkbox', { name: /^белый/ }));
    await user.click(colours.getByRole('button', { name: 'Применить' }));
    expect(within(region).queryByRole('button', { name: 'Цвет' })).not.toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Очистить фильтры' }));
    expect(within(region).getByRole('button', { name: 'Цвет' })).toBeInTheDocument();

    const coloursAgain = await open(user, 'Цвет');
    for (const box of coloursAgain.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });

  describe('the phone panels', () => {
    function renderPanels() {
      const heading = within(renderRegion()).getByRole('heading', {
        name: /^ProductSortFilterPanel, ColorFilterPanel/,
      });
      return within(heading.nextElementSibling as HTMLElement);
    }

    it('shows every filter as a closed accordion section and the discount switch', () => {
      const panels = renderPanels();
      for (const name of ['Сортировка', 'Цвет', 'Материал', 'Сезон', 'Бренд', 'Размер', 'Цена']) {
        expect(panels.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
      }
      expect(panels.getByRole('switch', { name: 'Только со скидкой' })).not.toBeChecked();
      expect(panels.getByText('Последний вызов: —')).toBeInTheDocument();
    });

    it('reports a ticked brand and a picked sort at once, with no "Применить"', async () => {
      const user = userEvent.setup();
      const panels = renderPanels();

      await user.click(panels.getByRole('button', { name: 'Бренд' }));
      await user.click(panels.getByRole('checkbox', { name: /Brisko/ }));
      expect(
        panels.getByText(
          `Последний вызов: BrandFilterPanel onValueChange: ${JSON.stringify([facetId('brands', 'Brisko')])}`,
        ),
      ).toBeInTheDocument();
      expect(panels.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();

      await user.click(panels.getByRole('button', { name: 'Сортировка' }));
      await user.click(panels.getByRole('radio', { name: 'Сначала дешевле' }));
      expect(
        panels.getByText('Последний вызов: ProductSortFilterPanel onValueChange: "price_asc"'),
      ).toBeInTheDocument();
    });
  });

  it('clears an applied price back to a bare chip and the data bounds', async () => {
    const user = userEvent.setup();
    const { region, open } = renderLive();

    const price = await open(user, 'Цена');
    await user.type(price.getByRole('textbox', { name: 'Мин. цена' }), '1500');
    await user.click(price.getByRole('button', { name: 'Применить' }));
    expect(within(region).queryByRole('button', { name: 'Цена' })).not.toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Очистить фильтры' }));
    expect(within(region).getByRole('button', { name: 'Цена' })).toBeInTheDocument();

    const priceAgain = await open(user, 'Цена');
    const min = priceAgain.getByRole('textbox', { name: 'Мин. цена' });
    const max = priceAgain.getByRole('textbox', { name: 'Макс. цена' });
    expect(min).toHaveValue('');
    expect(max).toHaveValue('');
    expect(min).toHaveAttribute('placeholder', '990');
    expect(max).toHaveAttribute('placeholder', expect.stringMatching(/^18\s990$/));
  });
});
