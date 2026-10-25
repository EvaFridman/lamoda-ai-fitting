import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FittingItem } from '@/entities/fitting';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import { LookItemRow } from './look-item-row';

const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const RED = '00000000-0000-4000-8000-0000000000c1';
const BLUE = '00000000-0000-4000-8000-0000000000c2';
const DATE = '2026-10-20T12:00:00.000Z';

const product = {
  id: PRODUCT,
  article: 'A-1',
  name: 'Тренч Nord',
  brand: { id: PRODUCT, name: 'Brand' },
  category: { id: PRODUCT, name: 'Верхняя одежда', slug: 'outerwear' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
  description: null,
  images: [],
  variations: [{ id: PRODUCT, size: 'M', stock: 3 }],
  attributes: [
    {
      attribute: { id: PRODUCT, name: 'Цвет' },
      values: [
        { id: RED, value: 'Красный', colorHex: '#FF0000' },
        { id: BLUE, value: 'Синий', colorHex: '#0000FF' },
      ],
    },
  ],
};

function item(patch: Partial<FittingItem> = {}): FittingItem {
  return {
    productId: PRODUCT,
    name: 'Тренч Nord',
    brand: 'Brand',
    imageUrl: null,
    price: 5000,
    finalPrice: 5000,
    attributeValueId: RED,
    colour: 'Красный',
    slot: 'outerwear',
    ...patch,
  };
}

function renderRow(patch: Partial<FittingItem> = {}, disabled = false) {
  const onColour = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LookItemRow item={item(patch)} disabled={disabled} onColour={onColour} />
    </QueryClientProvider>,
  );
  return onColour;
}

const sent = (element: string) =>
  mocks.track.mock.calls
    .filter(([event, props]) => event === 'Element Clicked' && props.element === element)
    .map(([, props]) => props);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(product), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LookItemRow analytics (A94.2)', () => {
  it('sends result.item-colour with the slot, then asks for the other colour', async () => {
    const onColour = renderRow();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Синий' }));

    expect(sent('result.item-colour')).toEqual([
      expect.objectContaining({ element: 'result.item-colour', slot: 'outerwear' }),
    ]);
    expect(onColour).toHaveBeenCalledExactlyOnceWith(BLUE);
  });

  it('sends nothing and asks for nothing when the current colour is clicked', async () => {
    const onColour = renderRow();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Красный' }));

    expect(sent('result.item-colour')).toEqual([]);
    expect(onColour).not.toHaveBeenCalled();
  });

  it('sends nothing for an item with no slot, but still asks for the colour', async () => {
    const onColour = renderRow({ slot: null });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Синий' }));

    expect(sent('result.item-colour')).toEqual([]);
    expect(onColour).toHaveBeenCalledExactlyOnceWith(BLUE);
  });

  it('sends result.add-to-cart of kind look from «В корзину»', async () => {
    renderRow();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'В корзину' }));

    expect(sent('result.add-to-cart')).toEqual([
      expect.objectContaining({ element: 'result.add-to-cart', kind: 'look' }),
    ]);
  });
});
