import { describe, expect, it } from 'vitest';

import type { Fitting, FittingItem } from '@/entities/fitting';

import { changedItemText, itemsBySlot } from './look-result';
import { itemsText } from './look-subject';

const WHITE = '00000000-0000-4000-8000-0000000000c1';
const BLACK = '00000000-0000-4000-8000-0000000000c2';

function item(n: number, patch: Partial<FittingItem> = {}): FittingItem {
  return {
    productId: `00000000-0000-4000-8000-00000000000${n}`,
    name: `Рубашка Annen ${n}`,
    brand: 'Annen',
    imageUrl: null,
    price: 1000,
    finalPrice: 900,
    attributeValueId: WHITE,
    colour: 'Белый',
    slot: 'top',
    ...patch,
  };
}

function fitting(items: FittingItem[]): Fitting {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    kind: 'look',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items,
    promptText: null,
    photoId: null,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: null,
  };
}

describe('itemsBySlot', () => {
  it('orders the items top, bottom, outerwear, shoes, accessory', () => {
    const items = [
      item(1, { slot: 'accessory' }),
      item(2, { slot: 'shoes' }),
      item(3, { slot: 'top' }),
      item(4, { slot: 'outerwear' }),
      item(5, { slot: 'bottom' }),
    ];

    expect(itemsBySlot(items).map(({ slot }) => slot)).toEqual([
      'top',
      'bottom',
      'outerwear',
      'shoes',
      'accessory',
    ]);
  });

  it('puts an item with no slot last and leaves the input as it was', () => {
    const items = [item(1, { slot: null }), item(2, { slot: 'shoes' })];

    expect(itemsBySlot(items).map(({ slot }) => slot)).toEqual(['shoes', null]);
    expect(items.map(({ slot }) => slot)).toEqual([null, 'shoes']);
  });
});

describe('changedItemText', () => {
  it('names the item whose colour changed, in lower case, with the new colour', () => {
    const before = fitting([item(1), item(2, { slot: 'bottom', name: 'Джинсы' })]);
    const after = fitting([
      item(1, { attributeValueId: BLACK, colour: 'Чёрный', name: 'Тренч Nord' }),
      item(2, { slot: 'bottom', name: 'Джинсы' }),
    ]);

    expect(changedItemText(before, after)).toBe('тренч Nord, Чёрный');
  });

  it('is the name alone when the new colour has no name', () => {
    const before = fitting([item(1, { name: 'Рубашка' })]);
    const after = fitting([item(1, { name: 'Рубашка', attributeValueId: null, colour: null })]);

    expect(changedItemText(before, after)).toBe('рубашка');
  });

  it('is null when no colour changed', () => {
    const same = fitting([item(1), item(2, { slot: 'bottom' })]);

    expect(changedItemText(same, same)).toBeNull();
  });
});

describe('itemsText', () => {
  it.each([
    [2, '2 вещи'],
    [3, '3 вещи'],
    [5, '5 вещей'],
    [1, '1 вещь'],
  ])('says %i as %s', (count, text) => {
    expect(itemsText(count)).toBe(text);
  });
});
