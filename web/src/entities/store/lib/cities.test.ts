import { describe, expect, it } from 'vitest';

import type { Store } from '../model/schemas';
import type { City } from './cities';
import { cityName, matchCities, nearestCity, storeCities, storesOfCity } from './cities';

function store(n: number, city: string, latitude = 55, longitude = 37): Store {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Магазин ${n}`,
    type: 'sport',
    city,
    street: 'ул. Тестовая',
    house: '1',
    mall: '',
    latitude,
    longitude,
    metroStations: [],
    workTime: 'пн–вс: 10:00–22:00',
    description: '',
    phones: [],
  };
}

// `city`, latitude, longitude of api/src/seed/stores.data.ts, in its order (48 stores).
const SEED: readonly (readonly [string, number, number])[] = [
  ['г. Москва', 55.755804, 37.614608],
  ['г. Москва', 55.761776, 37.619091],
  ['г. Москва', 55.731014, 37.639958],
  ['г. Москва', 55.761745, 37.566548],
  ['г. Москва', 55.794401, 37.592042],
  ['г. Москва', 55.749162, 37.539742],
  ['г. Москва', 55.790231, 37.531289],
  ['г. Москва', 55.845855, 37.662093],
  ['г. Москва', 55.823216, 37.497468],
  ['г. Одинцово, с. Немчиновка', 55.720418, 37.378791],
  ['г. Красногорск', 55.820936, 37.387738],
  ['г. Москва', 55.621409, 37.713962],
  ['г. Котельники', 55.653299, 37.844217],
  ['г. Москва', 55.623788, 37.422036],
  ['г. Видное, пос. совхоза им. Ленина', 55.585326, 37.724822],
  ['г. Пушкино, тер. 33-й км автодороги М8 Холмогоры', 56.001141880336, 37.882002418029],
  ['г. Санкт-Петербург', 59.927563, 30.360613],
  ['г. Санкт-Петербург', 59.94015, 30.418366],
  ['г. Санкт-Петербург', 59.879922, 30.265625],
  ['г. Санкт-Петербург', 60.01154, 30.397812],
  ['г. Абакан', 53.722825, 91.445505],
  ['г. Архангельск', 64.541949, 40.535031],
  ['г. Архангельск', 64.524224, 40.601758],
  ['г. Воронеж', 51.667194, 39.191906],
  ['г. Геленджик', 44.563247, 38.078624],
  ['г. Екатеринбург', 56.899714, 60.613177],
  ['г. Екатеринбург', 56.739712, 60.542857],
  ['г. Иркутск', 52.273274, 104.290685],
  ['г. Киров', 58.614508, 49.597541],
  ['г. Краснодар', 45.01144, 39.122574],
  ['г. Краснодар', 45.039464, 38.974343],
  ['г. Краснодар', 45.02654, 39.046298],
  ['г. Красноярск', 56.04213, 92.91363],
  ['г. Липецк', 52.592357, 39.504331],
  ['г. Мурманск', 68.956546, 33.070579],
  ['г. Нижний Новгород', 56.308975, 43.987292],
  ['г. Новороссийск', 44.725327, 37.76292],
  ['г. Новосибирск', 55.028806, 82.93659],
  ['г. Обнинск', 55.116902, 36.593277],
  ['г. Омск', 54.971796, 73.284776],
  ['г. Пермь', 57.973928, 56.156976],
  ['г. Саратов', 51.541568, 46.014206],
  ['г. Сочи', 43.606254, 39.732314],
  ['г. Сургут', 61.277526, 73.365248],
  ['г. Тула', 54.193544, 37.63712],
  ['г. Тюмень', 57.118657, 65.577249],
  ['г. Южно-Сахалинск', 46.900361, 142.742371],
  ['г. Ярославль', 57.627759, 39.871167],
];

const seedStores = SEED.map(([city, latitude, longitude], i) =>
  store(i + 1, city, latitude, longitude),
);

const KM_PER_DEGREE = (2 * Math.PI * 6371) / 360;

describe('cityName', () => {
  it('drops «г. » and everything after the first comma', () => {
    expect(cityName('г. Видное, пос. совхоза им. Ленина')).toBe('Видное');
    expect(cityName('г. Пушкино, тер. 33-й км автодороги М8 Холмогоры')).toBe('Пушкино');
  });

  it('drops the prefix in any case and with any spaces after the dot', () => {
    expect(cityName('Г. Тверь')).toBe('Тверь');
    expect(cityName('г.   Омск')).toBe('Омск');
  });

  it('needs at least one space after «г.»', () => {
    expect(cityName('г.Москва')).toBe('г.Москва');
    expect(cityName('г.о. Химки')).toBe('г.о. Химки');
  });

  it('leaves a value with neither as it is', () => {
    expect(cityName('Москва')).toBe('Москва');
    expect(cityName('Санкт-Петербург')).toBe('Санкт-Петербург');
  });

  it('trims what is left', () => {
    expect(cityName('  г. Тула  , ул. Ленина')).toBe('Тула');
  });
});

describe('storeCities', () => {
  it('lists the 31 cities of the seed: Москва, Санкт-Петербург, then the Russian alphabet', () => {
    expect(storeCities(seedStores).map((city) => city.name)).toEqual([
      'Москва',
      'Санкт-Петербург',
      'Абакан',
      'Архангельск',
      'Видное',
      'Воронеж',
      'Геленджик',
      'Екатеринбург',
      'Иркутск',
      'Киров',
      'Котельники',
      'Красногорск',
      'Краснодар',
      'Красноярск',
      'Липецк',
      'Мурманск',
      'Нижний Новгород',
      'Новороссийск',
      'Новосибирск',
      'Обнинск',
      'Одинцово',
      'Омск',
      'Пермь',
      'Пушкино',
      'Саратов',
      'Сочи',
      'Сургут',
      'Тула',
      'Тюмень',
      'Южно-Сахалинск',
      'Ярославль',
    ]);
  });

  it('keeps every point of a city as [longitude, latitude]', () => {
    const cities = storeCities(seedStores);
    expect(cities.find((city) => city.name === 'Екатеринбург')?.points).toEqual([
      [60.613177, 56.899714],
      [60.542857, 56.739712],
    ]);
    expect(cities.find((city) => city.name === 'Москва')?.points).toHaveLength(11);
    expect(cities.find((city) => city.name === 'Санкт-Петербург')?.points).toHaveLength(4);
    expect(cities.find((city) => city.name === 'Одинцово')?.points).toEqual([
      [37.378791, 55.720418],
    ]);
  });

  it('puts the first two first even when the stores come in another order', () => {
    const names = storeCities([
      store(1, 'г. Абакан'),
      store(2, 'г. Санкт-Петербург'),
      store(3, 'г. Москва'),
    ]).map((city) => city.name);
    expect(names).toEqual(['Москва', 'Санкт-Петербург', 'Абакан']);
  });
});

describe('storesOfCity', () => {
  it('returns only the city stores, in input order', () => {
    const a = store(1, 'г. Москва');
    const b = store(2, 'г. Тверь');
    const c = store(3, 'г. Москва');
    const d = store(4, 'г. Одинцово, с. Немчиновка');
    expect(storesOfCity([a, b, c, d], 'Москва')).toEqual([a, c]);
    expect(storesOfCity([a, b, c, d], 'Одинцово')).toEqual([d]);
    expect(storesOfCity([a, b, c, d], 'Омск')).toEqual([]);
  });
});

describe('nearestCity', () => {
  const cities: City[] = [
    { name: 'Москва', points: [[37.6173, 55.7558]] },
    { name: 'Санкт-Петербург', points: [[30.3351, 59.9343]] },
  ];

  it('finds the city of the nearest store', () => {
    expect(nearestCity(cities, { latitude: 55.7558, longitude: 37.6173 })).toBe('Москва');
    expect(nearestCity(cities, { latitude: 59.9343, longitude: 30.3351 })).toBe('Санкт-Петербург');
  });

  it('measures real distance, with latitude and longitude the right way round', () => {
    const spb: City[] = [{ name: 'Санкт-Петербург', points: [[30.3351, 59.9343]] }];
    const moscow = { latitude: 55.7558, longitude: 37.6173 };
    expect(nearestCity(spb, moscow, 640)).toBe('Санкт-Петербург');
    expect(nearestCity(spb, moscow, 630)).toBeNull();
  });

  it('bounds the distance at 100 km by default', () => {
    const position = { latitude: 50, longitude: 30 };
    const at = (km: number): City[] => [{ name: 'Город', points: [[30, 50 + km / KM_PER_DEGREE]] }];
    expect(nearestCity(at(99), position)).toBe('Город');
    expect(nearestCity(at(101), position)).toBeNull();
  });

  it('lets the nearest store win across cities', () => {
    const withTown: City[] = [...cities, { name: 'Химки', points: [[37.4, 55.9]] }];
    expect(nearestCity(withTown, { latitude: 55.89, longitude: 37.41 })).toBe('Химки');
  });

  it('answers null without cities', () => {
    expect(nearestCity([], { latitude: 55.7558, longitude: 37.6173 })).toBeNull();
  });
});

describe('matchCities', () => {
  const cities = storeCities(seedStores);
  const names = (found: City[]) => found.map((city) => city.name);

  it('matches the start of every word, in any case', () => {
    expect(names(matchCities(cities, 'МОС'))).toEqual(['Москва']);
    expect(names(matchCities(cities, 'санкт'))).toEqual(['Санкт-Петербург']);
  });

  it('splits on hyphens and takes several words', () => {
    expect(names(matchCities(cities, 'нижн новг'))).toEqual(['Нижний Новгород']);
    expect(names(matchCities(cities, 'петер'))).toEqual(['Санкт-Петербург']);
    expect(names(matchCities(cities, 'сахалин'))).toEqual(['Южно-Сахалинск']);
  });

  it('reads ё as е', () => {
    const list: City[] = [{ name: 'Орёл', points: [] }];
    expect(names(matchCities(list, 'орел'))).toEqual(['Орёл']);
    expect(names(matchCities(list, 'орёл'))).toEqual(['Орёл']);
  });

  it('returns a copy with every city for an empty text', () => {
    const all = matchCities(cities, '  ');
    expect(all).toEqual(cities);
    expect(all).not.toBe(cities);
  });

  it('returns nothing when no city matches', () => {
    expect(matchCities(cities, 'нью-йорк')).toEqual([]);
  });
});
