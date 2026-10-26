import { describe, expect, it } from 'vitest';

import { routeHref, storeAddress, telHref } from './links';

describe('telHref', () => {
  it('keeps the plus and the digits of Lamoda’s text', () => {
    expect(telHref('+7 (917) 599–61–90')).toBe('tel:+79175996190');
  });

  it('keeps a plain number as it is', () => {
    expect(telHref('88005553535')).toBe('tel:88005553535');
  });
});

describe('routeHref', () => {
  it('is Yandex Maps’ route from where the visitor is to the store', () => {
    expect(routeHref({ latitude: 55.755804, longitude: 37.614608 })).toBe(
      'https://yandex.ru/maps/?rtext=~55.755804,37.614608&rtt=auto',
    );
  });
});

describe('storeAddress', () => {
  it('joins the city, the street and the house', () => {
    expect(storeAddress({ city: 'г. Москва', street: 'пл. Манежная', house: '1 с2' })).toBe(
      'г. Москва, пл. Манежная, 1 с2',
    );
  });

  it('leaves out the empty parts', () => {
    expect(storeAddress({ city: 'г. Москва', street: '', house: '' })).toBe('г. Москва');
    expect(storeAddress({ city: 'г. Москва', street: 'ул. Тверская', house: '' })).toBe(
      'г. Москва, ул. Тверская',
    );
    expect(storeAddress({ city: '', street: '', house: '' })).toBe('');
  });
});
