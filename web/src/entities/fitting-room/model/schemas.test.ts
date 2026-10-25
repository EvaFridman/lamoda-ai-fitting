import { describe, expect, it } from 'vitest';

import {
  EMPTY_ROOM,
  fittingRoomChangeSchema,
  fittingRoomItemSchema,
  fittingRoomSchema,
  type FittingRoom,
  type FittingRoomItem,
  withoutSlot,
} from './schemas';

const DATE = '2026-10-01T12:00:00.000Z';
const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

function item(slot: FittingRoomItem['slot'], finalPrice: number, n = 1): FittingRoomItem {
  return {
    slot,
    attributeValueId: null,
    colour: null,
    product: {
      id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
      article: `A-${n}`,
      name: 'Рубашка',
      brand: { id: ID, name: 'Annen' },
      category: { id: ID, name: 'Рубашки', slug: 'shirts' },
      image: null,
      price: finalPrice,
      discount: 0,
      finalPrice,
      rating: null,
      createdAt: DATE,
      updatedAt: DATE,
    },
  };
}

function roomOf(...items: FittingRoomItem[]): FittingRoom {
  return {
    items,
    count: items.length,
    sum: items.reduce((sum, entry) => sum + entry.product.finalPrice, 0),
  };
}

describe('withoutSlot', () => {
  it('drops the slot, recounts and adds the prices up again', () => {
    const room = roomOf(item('top', 4000, 1), item('shoes', 6000, 2), item('bottom', 500, 3));

    expect(withoutSlot(room, 'shoes')).toEqual(
      roomOf(item('top', 4000, 1), item('bottom', 500, 3)),
    );
  });

  it('leaves the other items in their order', () => {
    const room = roomOf(item('top', 1, 1), item('bottom', 1, 2), item('outerwear', 1, 3));

    expect(withoutSlot(room, 'bottom').items.map((entry) => entry.slot)).toEqual([
      'top',
      'outerwear',
    ]);
  });

  it('is the same room for an empty slot', () => {
    const room = roomOf(item('top', 4000));

    expect(withoutSlot(room, 'accessory')).toEqual(room);
  });

  it('empties a room of one item, and an empty room stays empty', () => {
    expect(withoutSlot(roomOf(item('top', 4000)), 'top')).toEqual(EMPTY_ROOM);
    expect(withoutSlot(EMPTY_ROOM, 'top')).toEqual(EMPTY_ROOM);
  });

  it('does not change the room it was given', () => {
    const room = roomOf(item('top', 4000), item('shoes', 6000, 2));
    const before = structuredClone(room);

    withoutSlot(room, 'top');

    expect(room).toEqual(before);
  });
});

describe('the fitting room schemas', () => {
  it('read an item with its colour and drop a field they do not know', () => {
    const parsed = fittingRoomItemSchema.parse({
      ...item('top', 4000),
      attributeValueId: ID,
      colour: 'белый',
      extra: 'x',
    });

    expect(parsed.colour).toBe('белый');
    expect(parsed).not.toHaveProperty('extra');
  });

  it('refuse a slot the api does not have', () => {
    expect(fittingRoomItemSchema.safeParse({ ...item('top', 1), slot: 'hat' }).success).toBe(false);
  });

  it('read the room and a change whose replaced item is null', () => {
    const room = roomOf(item('top', 4000));

    expect(fittingRoomSchema.parse(room)).toEqual(room);
    expect(fittingRoomChangeSchema.parse({ room, replaced: null }).replaced).toBeNull();
  });

  it('read a change with the item it replaced', () => {
    const replaced = item('top', 100, 2);

    const change = fittingRoomChangeSchema.parse({ room: roomOf(item('top', 4000)), replaced });

    expect(change.replaced?.product.id).toBe(replaced.product.id);
  });

  it('refuse an answer without the count', () => {
    expect(fittingRoomSchema.safeParse({ items: [], sum: 0 }).success).toBe(false);
  });
});
