import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Price } from '@/shared/ui';

const nbsp = String.fromCodePoint(0xa0);

describe('Price', () => {
  it('shows the price alone with the currency, no strike and not discounted', () => {
    const { container } = render(<Price price={4500} />);

    expect(container.textContent).toBe(`4${nbsp}500${nbsp}₽`);
    expect(container.querySelector('s')).toBeNull();
    expect(container.firstElementChild).not.toHaveAttribute('data-discounted');
  });

  it('strikes one old price out, without "₽", and shows the price after it', () => {
    const { container } = render(<Price price={4521} oldPrices={[10_399]} variant="product" />);

    const struck = container.querySelectorAll('s');
    expect(struck).toHaveLength(1);
    expect(struck[0]?.textContent).toBe(`Старая цена 10${nbsp}399 ₽, `);
    expect(container.firstElementChild).toHaveAttribute('data-discounted');
  });

  it('reads as "Старая цена …, цена …" for one old price', () => {
    const { container } = render(<Price price={4521} oldPrices={[10_399]} />);

    expect(container.textContent).toBe(`Старая цена 10${nbsp}399 ₽, цена 4${nbsp}521${nbsp}₽`);
  });

  it('reads both old prices, the oldest first, then the price', () => {
    const { container } = render(<Price price={7746} oldPrices={[13_999, 9799]} />);

    expect(container.textContent).toBe(
      `Старая цена 13${nbsp}999 ₽, Старая цена 9${nbsp}799 ₽, цена 7${nbsp}746${nbsp}₽`,
    );
    expect(container.querySelectorAll('s')).toHaveLength(2);
    expect(container.firstElementChild).toHaveAttribute('data-discounted');
  });

  it('shows kopecks of the price', () => {
    const { container } = render(<Price price={1299.5} />);

    expect(container.textContent).toBe(`1${nbsp}299,50${nbsp}₽`);
  });

  it('gives the variant class', () => {
    const catalog = render(<Price price={1} />);
    expect(catalog.container.firstElementChild).toHaveClass('catalog');
    catalog.unmount();

    const product = render(<Price price={1} variant="product" />);
    expect(product.container.firstElementChild).toHaveClass('product');
  });
});
