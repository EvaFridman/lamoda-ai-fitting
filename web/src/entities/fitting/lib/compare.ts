import { formatPrice } from '@/shared/lib';

import type { Fitting } from '../model/schemas';

type Compared = Pick<Fitting, 'photoId' | 'items'>;

// One row of «Чем отличаются» (spec 0019 board 9, A93.5): its label and both sides' value.
export interface CompareRow {
  label: 'Цвет' | 'Вещи' | 'Фото' | 'Цена';
  value: string;
}

export interface FittingDifference {
  // The aside's rows on a wide screen.
  rows: CompareRow[];
  // The phones' «Отличается»: what differs, «ничего» when nothing does.
  differs: string;
  // The colours that differ, by product, for the columns to mark.
  colourChanged: Set<string>;
}

function sameProducts(a: Compared, b: Compared): boolean {
  const left = a.items.map((item) => item.productId).sort();
  const right = b.items.map((item) => item.productId).sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

type ComparedItem = Compared['items'][number];

// A colour left out is the product's own and is stored as null, so two entries of one colour may
// hold an id and a null: then the names decide.
function sameColour(a: ComparedItem, b: ComparedItem): boolean {
  if (a.attributeValueId !== null && b.attributeValueId !== null) {
    return a.attributeValueId === b.attributeValueId;
  }
  return a.colour === b.colour;
}

// An entry's price: the sum of its items' final prices.
export function fittingSum(fitting: Pick<Fitting, 'items'>): number {
  return fitting.items.reduce((sum, item) => sum + item.finalPrice, 0);
}

// What differs between two history entries: the colours of the same items (or the items
// themselves), the photo (two gone photos count as different) and the price.
export function fittingDifference(a: Compared, b: Compared): FittingDifference {
  const rows: CompareRow[] = [];
  const differs: string[] = [];
  const colourChanged = new Set<string>();

  if (sameProducts(a, b)) {
    const changes: string[] = [];
    for (const item of a.items) {
      const other = b.items.find((candidate) => candidate.productId === item.productId);
      if (!other || sameColour(item, other)) continue;
      colourChanged.add(item.productId);
      const pair = `${item.colour ?? '—'} / ${other.colour ?? '—'}`;
      changes.push(a.items.length > 1 ? `${item.name}: ${pair}` : pair);
    }
    rows.push({ label: 'Цвет', value: changes.length > 0 ? changes.join(', ') : 'одинаковый' });
    if (changes.length > 0) differs.push('цвет');
  } else {
    rows.push({ label: 'Вещи', value: 'разные' });
    differs.push('вещи');
  }

  const samePhoto = a.photoId !== null && a.photoId === b.photoId;
  rows.push({ label: 'Фото', value: samePhoto ? 'одно и то же' : 'разные' });
  if (!samePhoto) differs.push('фото');

  rows.push({
    label: 'Цена',
    value: `${formatPrice(fittingSum(a))} / ${formatPrice(fittingSum(b))}`,
  });

  return {
    rows,
    differs: differs.length > 0 ? differs.join(', ') : 'ничего',
    colourChanged,
  };
}
