import { describe, expect, it } from 'vitest';

import {
  emptySlotCaption,
  OUTFIT_SLOTS,
  ROOM_CAPACITY,
  roomItemName,
  SLOT_ACCUSATIVE,
  SLOT_SHORT,
  SLOT_TITLES,
} from './slots';

describe('the slots', () => {
  it('are five, in the room order', () => {
    expect(OUTFIT_SLOTS).toEqual(['top', 'bottom', 'outerwear', 'shoes', 'accessory']);
    expect(ROOM_CAPACITY).toBe(5);
  });

  it.each(OUTFIT_SLOTS)('have a title, an accusative and a short name for %s', (slot) => {
    expect(SLOT_TITLES[slot]).not.toBe('');
    expect(SLOT_ACCUSATIVE[slot]).not.toBe('');
    expect(SLOT_SHORT[slot]).not.toBe('');
  });

  it('name the outerwear in the accusative for the replace toast', () => {
    expect(SLOT_ACCUSATIVE.outerwear).toBe('верхнюю одежду');
  });
});

describe('emptySlotCaption', () => {
  it('says what goes into the accessory slot', () => {
    expect(emptySlotCaption('accessory')).toBe('Слот свободен: сумка, шарф или головной убор');
  });

  it('is short for the others', () => {
    expect(emptySlotCaption('top')).toBe('Слот свободен');
    expect(emptySlotCaption('shoes')).toBe('Слот свободен');
  });
});

describe('roomItemName', () => {
  it('puts the brand after the name', () => {
    expect(roomItemName({ name: 'Рубашка', brand: { name: 'Annen' } })).toBe('Рубашка Annen');
  });
});
