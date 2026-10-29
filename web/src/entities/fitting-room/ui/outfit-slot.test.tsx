import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FittingRoomItem } from '../model/schemas';

import { EmptySlotRow, OutfitSlotRow, SlotRowSkeleton } from './outfit-slot';

const DATE = '2026-10-01T12:00:00.000Z';
const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

function item(patch: Partial<FittingRoomItem['product']> = {}): FittingRoomItem {
  return {
    slot: 'top',
    attributeValueId: null,
    colour: null,
    product: {
      id: ID,
      article: 'A-1',
      name: 'Рубашка',
      brand: { id: ID, name: 'Annen' },
      category: { id: ID, name: 'Рубашки', slug: 'shirts' },
      image: { url: 'https://media.test/shirt.jpg' },
      price: 5000,
      discount: 0,
      finalPrice: 5000,
      rating: null,
      createdAt: DATE,
      updatedAt: DATE,
      ...patch,
    },
  };
}

describe('OutfitSlotRow', () => {
  it('names the slot, the item and links the name to the product', () => {
    render(<OutfitSlotRow item={item()} href={`/products/${ID}`} />);

    expect(screen.getByText('Верхний слой и платья')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Рубашка Annen' })).toHaveAttribute(
      'href',
      `/products/${ID}`,
    );
  });

  it('draws the catalog photo as an image with no alt text and no tab stop', () => {
    const { container } = render(<OutfitSlotRow item={item()} href="/p" />);

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://media.test/shirt.jpg');
    expect(image).toHaveAttribute('alt', '');
    expect(image?.closest('a')).toHaveAttribute('tabindex', '-1');
  });

  it('draws no image for a product without a photo', () => {
    const { container } = render(<OutfitSlotRow item={item({ image: null })} href="/p" />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the old price only with a discount', () => {
    const { rerender } = render(<OutfitSlotRow item={item()} href="/p" />);
    expect(screen.queryByText(/Старая цена/)).not.toBeInTheDocument();

    rerender(<OutfitSlotRow item={item({ discount: 20, finalPrice: 4000 })} href="/p" />);
    expect(screen.getByText(/Старая цена/)).toBeInTheDocument();
  });

  it('places the controls and the aside given by the placer', async () => {
    const onClick = vi.fn();
    render(
      <OutfitSlotRow
        item={item()}
        href="/p"
        controls={<span>controls</span>}
        aside={
          <button type="button" onClick={onClick}>
            Убрать
          </button>
        }
      />,
    );

    expect(screen.getByText('controls')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Убрать' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('EmptySlotRow', () => {
  it('names the slot and has no caption', () => {
    render(<EmptySlotRow slot="shoes" />);

    expect(screen.getByText('Обувь')).toBeInTheDocument();
    expect(screen.queryByText(/Слот свободен/)).not.toBeInTheDocument();
  });

  it('has no caption for the accessory either, and no link', () => {
    render(<EmptySlotRow slot="accessory" />);

    expect(screen.getByText('Аксессуары')).toBeInTheDocument();
    expect(screen.queryByText(/Слот свободен/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
  });

  it('marks the accessory «скоро», hidden from assistive technology (AC10)', () => {
    render(<EmptySlotRow slot="accessory" />);

    const chip = screen.getByText('скоро');
    expect(chip.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      screen.queryByText('скоро', { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' }),
    ).toBeNull();
    expect(screen.getByText('Аксессуары')).toContainElement(chip);
  });

  it('shows no «скоро» for a slot with an address', () => {
    render(<EmptySlotRow slot="shoes" href="/catalog/shoes" />);

    expect(screen.queryByText('скоро')).not.toBeInTheDocument();
  });

  it('shows no «скоро» for a non-accessory slot with no address yet (categories loading)', () => {
    render(<EmptySlotRow slot="shoes" />);

    expect(screen.getByText('Обувь')).toBeInTheDocument();
    expect(screen.queryByText('скоро')).not.toBeInTheDocument();
  });

  it('makes the «+» box a link to the same address, out of the tab order and hidden', () => {
    render(<EmptySlotRow slot="top" href="/catalog/shirts" />);

    const box = screen.getByText('+').closest('a');
    expect(box).toHaveAttribute('href', '/catalog/shirts');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('gives the «+» box the same link events', async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<EmptySlotRow slot="top" href="/catalog/shirts" linkEvents={{ onClick }} />);

    await userEvent.setup().click(screen.getByText('+'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('links «Подобрать в каталоге» only with an address', () => {
    const { rerender } = render(<EmptySlotRow slot="top" href="/catalog/shirts" />);
    expect(screen.getByRole('link', { name: 'Подобрать в каталоге' })).toHaveAttribute(
      'href',
      '/catalog/shirts',
    );

    rerender(<EmptySlotRow slot="top" />);
    expect(screen.queryByRole('link', { name: 'Подобрать в каталоге' })).not.toBeInTheDocument();
  });

  it('hands the click to the link events', async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<EmptySlotRow slot="top" href="/catalog/shirts" linkEvents={{ onClick }} />);

    await userEvent.setup().click(screen.getByRole('link', { name: 'Подобрать в каталоге' }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('SlotRowSkeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<SlotRowSkeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(within(container).queryByRole('link')).not.toBeInTheDocument();
  });
});
