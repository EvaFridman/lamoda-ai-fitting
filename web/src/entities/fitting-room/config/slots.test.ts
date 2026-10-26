import { describe, expect, it } from 'vitest';

import {
  bySlot,
  OUTFIT_SLOTS,
  ROOM_CAPACITY,
  roomItemName,
  SLOT_SHORT,
  SLOT_TITLES,
} from './slots';

describe('the slots', () => {
  it('are five, in the room order', () => {
    expect(OUTFIT_SLOTS).toEqual(['top', 'bottom', 'outerwear', 'shoes', 'accessory']);
    expect(ROOM_CAPACITY).toBe(5);
  });

  it('are titled as Y5 says', () => {
    expect(SLOT_TITLES).toEqual({
      top: 'Верхний слой и платья',
      bottom: 'Нижний слой',
      outerwear: 'Верхняя одежда',
      shoes: 'Обувь',
      accessory: 'Аксессуары',
    });
  });

  it('have the short names of the phone’s cells', () => {
    expect(SLOT_SHORT).toEqual({
      top: 'верхний',
      bottom: 'нижний',
      outerwear: 'пальто',
      shoes: 'обувь',
      accessory: 'аксесс.',
    });
  });
});

describe('bySlot', () => {
  it('orders items as the room does, whatever order they come in', () => {
    const items = [
      { id: 'accessory', slot: 'accessory' as const },
      { id: 'shoes', slot: 'shoes' as const },
      { id: 'top', slot: 'top' as const },
      { id: 'outerwear', slot: 'outerwear' as const },
      { id: 'bottom', slot: 'bottom' as const },
    ];

    expect(bySlot(items).map((item) => item.id)).toEqual([
      'top',
      'bottom',
      'outerwear',
      'shoes',
      'accessory',
    ]);
  });

  it('puts an item with no slot last', () => {
    const items = [
      { id: 'none', slot: null },
      { id: 'accessory', slot: 'accessory' as const },
      { id: 'top', slot: 'top' as const },
    ];

    expect(bySlot(items).map((item) => item.id)).toEqual(['top', 'accessory', 'none']);
  });

  it('keeps the input order for equal slots', () => {
    const items = [
      { id: 'n1', slot: null },
      { id: 's1', slot: 'shoes' as const },
      { id: 'n2', slot: null },
      { id: 's2', slot: 'shoes' as const },
    ];

    expect(bySlot(items).map((item) => item.id)).toEqual(['s1', 's2', 'n1', 'n2']);
  });

  it('does not change the input', () => {
    const items = [
      { id: 'bottom', slot: 'bottom' as const },
      { id: 'top', slot: 'top' as const },
    ];
    const copy = [...items];

    const sorted = bySlot(items);

    expect(items).toEqual(copy);
    expect(sorted).not.toBe(items);
  });

  it('answers an empty list for an empty one', () => {
    expect(bySlot([])).toEqual([]);
  });
});

describe('roomItemName', () => {
  it('puts the brand after the name', () => {
    expect(roomItemName({ name: 'Рубашка', brand: { name: 'Annen' } })).toBe('Рубашка Annen');
  });
});
