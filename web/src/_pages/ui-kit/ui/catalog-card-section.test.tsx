import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Карточка товара в каталоге' });
}

function renderCards() {
  const region = renderRegion();
  const [discounted, fullPrice, noPhoto, noRating, longName] = within(region).getAllByRole(
    'article',
  ) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
  return { region, discounted, fullPrice, noPhoto, noRating, longName };
}

describe('catalog card section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'catalog-card',
      'Карточка товара в каталоге',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows five cards and the skeleton', () => {
    const { region } = renderCards();

    expect(within(region).getAllByRole('article')).toHaveLength(5);
    expect(region.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
  });

  it('shows the discount badge with the old and the new price', () => {
    const { discounted, fullPrice } = renderCards();

    expect(within(discounted).getByText('−20%')).toBeInTheDocument();
    expect(within(discounted).getByText(/5\s990/)).toBeInTheDocument();
    expect(within(discounted).getByText(/4\s792\s₽/)).toBeInTheDocument();
    expect(within(discounted).getByText('Платье-бюстье миди')).toBeInTheDocument();
    expect(within(fullPrice).queryByText(/^−\d+%$/)).not.toBeInTheDocument();
  });

  it('says "Нет фото" on the card with no photo only', () => {
    const { region, noPhoto } = renderCards();

    expect(within(noPhoto).getByText('Нет фото')).toBeInTheDocument();
    expect(within(region).getAllByText('Нет фото')).toHaveLength(1);
  });

  it('shows no rating on the card with none, and one on the others', () => {
    const { noRating, discounted } = renderCards();

    expect(within(noRating).queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
    expect(within(discounted).getByRole('img', { name: 'Рейтинг 4,7 из 5' })).toBeInTheDocument();
  });

  it('shows the long name', () => {
    const { longName } = renderCards();

    expect(within(longName).getByText(/^Пальто-тренч двубортное с поясом/)).toBeInTheDocument();
  });

  it('puts the favourite toggle in the discounted card only, outside the link', () => {
    const { region, discounted } = renderCards();

    const toggle = within(discounted).getByRole('button', { name: 'В избранное' });
    expect(within(region).getAllByRole('button', { name: 'В избранное' })).toHaveLength(1);
    expect(within(discounted).getByRole('link')).not.toContainElement(toggle);
  });

  it('leads every card to the section anchor', () => {
    const { region } = renderCards();

    for (const link of within(region).getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '#catalog-card');
    }
  });

  it('presses and releases the toggle on clicks', async () => {
    const user = userEvent.setup();
    const { discounted } = renderCards();

    const toggle = within(discounted).getByRole('button', { name: 'В избранное' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
