import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Навигация' });
}

// The live pagination example: the block under its own heading.
function liveExample(region: HTMLElement) {
  const title = within(region).getByRole('heading', { level: 4, name: /живой пример/ });
  const block = title.nextElementSibling;
  if (!(block instanceof HTMLElement)) throw new Error('no live pagination example');
  return within(block);
}

describe('navigation section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'navigation',
      'Навигация',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  // AC3
  it('shows tabs of three sizes, breadcrumbs, paginations and accordions', () => {
    const region = renderRegion();

    for (const name of ['О товаре: size l', 'О товаре: size m', 'О товаре: size s']) {
      expect(within(region).getByRole('tablist', { name })).toBeInTheDocument();
    }
    expect(
      within(region).getByRole('navigation', { name: 'Навигация по разделам' }),
    ).toBeInTheDocument();
    expect(within(region).getAllByRole('navigation', { name: 'Страницы' })).toHaveLength(4);
    expect(within(region).getAllByRole('heading', { level: 3, name: 'Доставка' })).toHaveLength(3);
  });

  // AC4
  it('switches a tab panel on click', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const tablist = within(region).getByRole('tablist', { name: 'О товаре: size l' });
    const tabs = within(tablist.parentElement as HTMLElement);
    expect(tabs.getByRole('tabpanel')).toHaveTextContent('Женский вязаный кардиган');

    await user.click(tabs.getByRole('tab', { name: 'Отзывы 54' }));

    expect(tabs.getByRole('tabpanel')).toHaveTextContent('54 отзыва о товаре.');
  });

  // AC8
  it('moves across tabs with the arrows', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const tablist = within(region).getByRole('tablist', { name: 'О товаре: size l' });
    const tabs = within(tablist.parentElement as HTMLElement);

    await user.click(tabs.getByRole('tab', { name: 'О товаре' }));
    await user.keyboard('{ArrowRight}');

    expect(tabs.getByRole('tab', { name: 'О бренде' })).toHaveFocus();
    expect(tabs.getByRole('tabpanel')).toHaveTextContent('Sandrine');
  });

  it('marks the disabled tab of the m example and opens the middle one', () => {
    const region = renderRegion();
    const tablist = within(region).getByRole('tablist', { name: 'О товаре: size m' });
    const tabs = within(tablist.parentElement as HTMLElement);

    expect(tabs.getByRole('tab', { name: 'Вопросы 0' })).toHaveAttribute('aria-disabled', 'true');
    expect(tabs.getByRole('tab', { name: 'Отзывы 54' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lands the focus on the disabled tab of the m example without selecting it', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const tablist = within(region).getByRole('tablist', { name: 'О товаре: size m' });
    const tabs = within(tablist.parentElement as HTMLElement);

    await user.click(tabs.getByRole('tab', { name: 'Отзывы 54' }));
    await user.keyboard('{ArrowRight}');

    const questions = tabs.getByRole('tab', { name: 'Вопросы 0' });
    expect(questions).toHaveFocus();
    expect(questions).toHaveAttribute('aria-selected', 'false');
    expect(tabs.getByRole('tab', { name: 'Отзывы 54' })).toHaveAttribute('aria-selected', 'true');
    expect(tabs.getByRole('tabpanel')).toHaveTextContent('54 отзыва о товаре.');
  });

  // AC8
  it('opens an accordion row with Enter', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const [first] = within(region).getAllByRole('button', { name: 'Состав и уход' });
    if (!first) throw new Error('no accordion');
    expect(first).toHaveAttribute('aria-expanded', 'false');

    first.focus();
    await user.keyboard('{Enter}');

    expect(first).toHaveAttribute('aria-expanded', 'true');
  });

  it('links the static pagination examples back to the section', () => {
    const region = renderRegion();
    const [nav] = within(region).getAllByRole('navigation', { name: 'Страницы' });
    if (!nav) throw new Error('no pagination');

    expect(within(nav).getByRole('link', { name: 'Страница 2' })).toHaveAttribute(
      'href',
      '#navigation',
    );
    expect(within(nav).getByRole('link', { name: 'Страница 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  describe('live pagination', () => {
    it('starts with 10 of 95', () => {
      const live = liveExample(renderRegion());

      expect(live.getByText('10 из 95')).toBeInTheDocument();
    });

    it('grows the counter with "Показать ещё"', async () => {
      const user = userEvent.setup();
      const live = liveExample(renderRegion());

      await user.click(live.getByRole('button', { name: 'Показать ещё' }));

      expect(live.getByText('20 из 95')).toBeInTheDocument();
      expect(live.getByRole('button', { name: 'Страница 2' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('resets the counter when a page number is picked', async () => {
      const user = userEvent.setup();
      const live = liveExample(renderRegion());
      await user.click(live.getByRole('button', { name: 'Показать ещё' }));
      expect(live.getByText('20 из 95')).toBeInTheDocument();

      await user.click(live.getByRole('button', { name: 'Страница 3' }));

      expect(live.getByText('10 из 95')).toBeInTheDocument();
    });

    it('runs the counter up to "95 из 95" and drops the button on the last page', async () => {
      const user = userEvent.setup();
      const live = liveExample(renderRegion());

      for (let step = 1; step <= 9; step++) {
        await user.click(live.getByRole('button', { name: 'Показать ещё' }));
      }

      expect(live.getByText('95 из 95')).toBeInTheDocument();
      expect(live.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
      expect(live.getByRole('button', { name: 'Страница 10' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('shows the rest on the last page and drops "Показать ещё"', async () => {
      const user = userEvent.setup();
      const live = liveExample(renderRegion());

      await user.click(live.getByRole('button', { name: 'Страница 10' }));

      expect(live.getByText('5 из 95')).toBeInTheDocument();
      expect(live.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
    });
  });
});
