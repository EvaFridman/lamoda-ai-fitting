import { describe, expect, it } from 'vitest';

import type { Store } from '../model/schemas';
import { matchStores } from './search';

function store(n: number, patch: Partial<Store>): Store {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    name: `Магазин ${n}`,
    type: 'sport',
    city: 'г. Москва',
    street: 'ул. Тестовая',
    house: '1',
    mall: '',
    latitude: 55,
    longitude: 37,
    metroStations: [],
    workTime: 'пн–вс: 10:00–22:00',
    description: '',
    phones: [],
    ...patch,
  };
}

const okhta = store(1, {
  name: 'ТЦ Охта Молл Sport',
  city: 'г. Санкт-Петербург',
  street: 'пр. Шаумяна',
  house: '4',
  mall: 'Охта Молл',
  metroStations: ['Ладожская'],
});
const manezh = store(2, {
  name: 'ТЦ Охотный ряд Urban',
  street: 'пл. Манежная',
  mall: 'Охотный ряд',
  metroStations: ['Охотный ряд'],
});
const ekb = store(3, {
  name: 'Гринвич Sport',
  city: 'г. Екатеринбург',
  street: 'ул. 8 Марта',
  mall: 'Гринвич',
});
const yo = store(4, { name: 'Звёздный Sport', city: 'г. Тверь' });
const stores = [manezh, okhta, ekb, yo];

describe('matchStores', () => {
  it('finds a store by its metro station (AC7)', () => {
    expect(matchStores(stores, 'Ладожская')).toEqual([okhta]);
  });

  it('finds a city by the start of its name', () => {
    expect(matchStores(stores, 'екат')).toEqual([ekb]);
  });

  it('finds by city, street, mall and name words', () => {
    expect(matchStores(stores, 'Екатеринбург')).toEqual([ekb]);
    expect(matchStores(stores, 'шаумяна')).toEqual([okhta]);
    expect(matchStores(stores, 'гринвич')).toEqual([ekb]);
    expect(matchStores(stores, 'urban')).toEqual([manezh]);
  });

  it('matches the start of a word only, not its middle', () => {
    expect(matchStores(stores, 'катер')).toEqual([]);
  });

  it('answers nothing when nothing matches', () => {
    expect(matchStores(stores, 'Владивосток')).toEqual([]);
  });

  it.each(['', '   ', ' , . '])('keeps every store in order for %j', (text) => {
    expect(matchStores(stores, text)).toEqual(stores);
  });

  it('returns a copy for an empty text', () => {
    expect(matchStores(stores, '')).not.toBe(stores);
  });

  it('keeps the original order of the matches', () => {
    expect(matchStores(stores, 'ох')).toEqual([manezh, okhta]);
  });

  it('requires every word of the text', () => {
    expect(matchStores(stores, 'охта ладожская')).toEqual([okhta]);
    expect(matchStores(stores, 'охта екатеринбург')).toEqual([]);
  });

  it('splits words on punctuation and ignores case', () => {
    expect(matchStores(stores, 'САНКТ-петербург')).toEqual([okhta]);
    expect(matchStores(stores, 'ул.8 марта')).toEqual([ekb]);
  });

  it('treats ё and е as the same letter', () => {
    expect(matchStores(stores, 'звездный')).toEqual([yo]);
    expect(matchStores(stores, 'звёздный')).toEqual([yo]);
  });
});
