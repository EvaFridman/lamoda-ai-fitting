import { describe, expect, it } from 'vitest';

import { formatPrice } from '@/shared/lib';

import { fittingDifference, fittingSum } from './compare';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function item(n: number, patch: { colourId?: number | null; colour?: string | null } = {}) {
  const colourId = patch.colourId === undefined ? n : patch.colourId;
  return {
    productId: uuid(100 + n),
    name: `Вещь ${n}`,
    brand: 'Annen',
    imageUrl: null,
    price: 1000,
    finalPrice: 900,
    attributeValueId: colourId === null ? null : uuid(300 + colourId),
    colour: patch.colour === undefined ? 'белый' : patch.colour,
    slot: null,
  };
}

const PHOTO = uuid(200);

describe('fittingSum', () => {
  it('adds the final prices of the items', () => {
    expect(fittingSum({ items: [item(1), item(2), item(3)] })).toBe(2700);
  });

  it('is zero without items', () => {
    expect(fittingSum({ items: [] })).toBe(0);
  });
});

describe('fittingDifference', () => {
  it('says nothing differs for the same item, colour and photo', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1)] },
      { photoId: PHOTO, items: [item(1)] },
    );
    expect(result.rows).toEqual([
      { label: 'Цвет', value: 'одинаковый' },
      { label: 'Фото', value: 'одно и то же' },
      { label: 'Цена', value: `${formatPrice(900)} / ${formatPrice(900)}` },
    ]);
    expect(result.differs).toBe('ничего');
    expect(result.colourChanged.size).toBe(0);
  });

  it('names both colours of one item and marks the product', () => {
    const a = { photoId: PHOTO, items: [item(1, { colourId: 1, colour: 'белый' })] };
    const b = { photoId: PHOTO, items: [item(1, { colourId: 2, colour: 'зелёный' })] };
    const result = fittingDifference(a, b);
    expect(result.rows[0]).toEqual({ label: 'Цвет', value: 'белый / зелёный' });
    expect(result.differs).toBe('цвет');
    expect([...result.colourChanged]).toEqual([uuid(101)]);
  });

  it('shows a dash for an item with no colour name', () => {
    const a = { photoId: PHOTO, items: [item(1, { colourId: null, colour: null })] };
    const b = { photoId: PHOTO, items: [item(1, { colourId: 2, colour: 'зелёный' })] };
    expect(fittingDifference(a, b).rows[0]?.value).toBe('— / зелёный');
  });

  it('compares colours by name when an item has no colour id, and calls the same name the same', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1, { colourId: null, colour: 'белый' })] },
      { photoId: PHOTO, items: [item(1, { colourId: null, colour: 'белый' })] },
    );
    expect(result.differs).toBe('ничего');
    expect(result.colourChanged.size).toBe(0);
  });

  it('compares colours by name when only one item lacks the id', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1, { colourId: null, colour: 'белый' })] },
      { photoId: PHOTO, items: [item(1, { colourId: 2, colour: 'белый' })] },
    );
    expect(result.differs).toBe('ничего');
  });

  it('marks another name as a change when an item has no colour id', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1, { colourId: null, colour: 'белый' })] },
      { photoId: PHOTO, items: [item(1, { colourId: null, colour: 'зелёный' })] },
    );
    expect(result.differs).toBe('цвет');
    expect([...result.colourChanged]).toEqual([uuid(101)]);
  });

  it('compares by id when both are set, even for the same name', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1, { colourId: 1, colour: 'белый' })] },
      { photoId: PHOTO, items: [item(1, { colourId: 2, colour: 'белый' })] },
    );
    expect(result.differs).toBe('цвет');
  });

  it('prefixes each changed item of a look with its name and skips the unchanged ones', () => {
    const a = {
      photoId: PHOTO,
      items: [
        item(1, { colourId: 1, colour: 'белый' }),
        item(2, { colourId: 5, colour: 'синий' }),
        item(3, { colourId: 6, colour: 'чёрный' }),
      ],
    };
    const b = {
      photoId: PHOTO,
      items: [
        item(3, { colourId: 6, colour: 'чёрный' }),
        item(2, { colourId: 7, colour: 'красный' }),
        item(1, { colourId: 2, colour: 'зелёный' }),
      ],
    };
    const result = fittingDifference(a, b);
    expect(result.rows[0]).toEqual({
      label: 'Цвет',
      value: 'Вещь 1: белый / зелёный, Вещь 2: синий / красный',
    });
    expect(result.colourChanged).toEqual(new Set([uuid(101), uuid(102)]));
  });

  it('says «Вещи: разные» for other items and does not compare colours', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1)] },
      { photoId: PHOTO, items: [item(2)] },
    );
    expect(result.rows.map((row) => row.label)).toEqual(['Вещи', 'Фото', 'Цена']);
    expect(result.rows[0]?.value).toBe('разные');
    expect(result.differs).toBe('вещи');
    expect(result.colourChanged.size).toBe(0);
  });

  it('counts a look with another number of items as other items', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1), item(2)] },
      { photoId: PHOTO, items: [item(1)] },
    );
    expect(result.rows[0]).toEqual({ label: 'Вещи', value: 'разные' });
  });

  it('says «Фото: разные» for two photos', () => {
    const result = fittingDifference(
      { photoId: uuid(201), items: [item(1)] },
      { photoId: uuid(202), items: [item(1)] },
    );
    expect(result.rows[1]).toEqual({ label: 'Фото', value: 'разные' });
    expect(result.differs).toBe('фото');
  });

  it('counts two deleted photos as different', () => {
    const result = fittingDifference(
      { photoId: null, items: [item(1)] },
      { photoId: null, items: [item(1)] },
    );
    expect(result.rows[1]).toEqual({ label: 'Фото', value: 'разные' });
  });

  it('lists every difference in the phone line', () => {
    const result = fittingDifference(
      { photoId: uuid(201), items: [item(1, { colourId: 1, colour: 'белый' })] },
      { photoId: uuid(202), items: [item(1, { colourId: 2, colour: 'зелёный' })] },
    );
    expect(result.differs).toBe('цвет, фото');
  });

  it('shows both sums in the price row', () => {
    const result = fittingDifference(
      { photoId: PHOTO, items: [item(1), item(2)] },
      { photoId: PHOTO, items: [item(3)] },
    );
    expect(result.rows.at(-1)).toEqual({
      label: 'Цена',
      value: `${formatPrice(1800)} / ${formatPrice(900)}`,
    });
  });
});
