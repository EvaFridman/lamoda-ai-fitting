import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

const nbsp = String.fromCodePoint(0xa0);

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Товар и заказ' });
}

describe('product section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'product',
      'Товар и заказ',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  // AC3
  it('shows every price layout', () => {
    const region = renderRegion();
    const text = region.textContent;

    expect(text).toContain(`4${nbsp}500${nbsp}₽`);
    expect(text).toContain(`Старая цена 4${nbsp}199 ₽, цена 2${nbsp}992${nbsp}₽`);
    expect(text).toContain(
      `Старая цена 13${nbsp}999 ₽, Старая цена 9${nbsp}799 ₽, цена 7${nbsp}746${nbsp}₽`,
    );
    expect(text).toContain(`1${nbsp}299,50${nbsp}₽`);
    expect(text).toContain(`Старая цена 10${nbsp}399 ₽, цена 4${nbsp}521${nbsp}₽`);
    expect(region.querySelectorAll('s')).toHaveLength(1 + 2 + 1 + 2);
    expect(region.querySelectorAll('.product')).not.toHaveLength(0);
  });

  // AC3
  it('shows every badge tone', () => {
    const region = renderRegion();

    // Some labels appear in a pair too, and a prop caption can repeat a tone name: only the
    // badge texts count.
    const toneOf = (label: string) =>
      within(region)
        .getAllByText(label, { selector: 'span' })
        .filter((el) =>
          el.parentElement?.parentElement?.parentElement?.className.includes('badges'),
        )
        .map((el) => el.parentElement);

    for (const element of toneOf('−40%')) expect(element).toHaveClass('discount');
    for (const element of toneOf('−56%')) expect(element).toHaveClass('discount');
    for (const element of toneOf('premium')) expect(element).toHaveClass('premium');
    for (const element of toneOf('до 25%')) expect(element).toHaveClass('promo');
    for (const element of toneOf('−7% club')) expect(element).toHaveClass('club');
    for (const element of toneOf('−5% club')) expect(element).toHaveClass('club');
    expect(toneOf('premium')).toHaveLength(2);
    expect(toneOf('−40%')).toHaveLength(2);
  });

  // AC3
  it('shows every order status tone', () => {
    const region = renderRegion();

    expect(within(region).getByText('Доставлен')).toHaveClass('primary');
    expect(within(region).getByText('Готов к выдаче')).toHaveClass('success');
    expect(within(region).getByText('Не выкуплен')).toHaveClass('warning');
    expect(within(region).getByText('Ожидает оплаты')).toHaveClass('caution');
    expect(within(region).getByText('Оформлен')).toHaveClass('secondary');
    expect(region.textContent).toContain('Доставлен 5 октября');
  });

  // AC9
  it('names each rating for assistive technology', () => {
    const region = renderRegion();

    expect(within(region).getByRole('img', { name: 'Рейтинг 4,7 из 5' })).toHaveTextContent('4.7');
    expect(within(region).getByRole('img', { name: 'Рейтинг 5,0 из 5' })).toHaveTextContent('5.0');
  });

  // AC3
  it('shows the favourite toggle in its states', () => {
    const region = renderRegion();
    const buttons = within(region).getAllByRole('button', { name: 'В избранное' });

    expect(buttons).toHaveLength(8);
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(3);
    expect(
      buttons.filter((b) => b.hasAttribute('disabled') || b.hasAttribute('data-disabled')),
    ).toHaveLength(1);
  });

  // AC4, AC9
  it('switches a favourite toggle on click and back, keeping its name', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const [first] = within(region).getAllByRole('button', { name: 'В избранное' });
    if (!first) throw new Error('no favourite toggle');
    expect(first).toHaveAttribute('aria-pressed', 'false');

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
  });
});
