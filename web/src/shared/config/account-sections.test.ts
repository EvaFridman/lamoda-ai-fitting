import { describe, expect, it } from 'vitest';

import { catalog } from '@/shared/analytics/catalog';

import { accountSections } from './account-sections';

describe('accountSections', () => {
  it('lists the five sections in the order of the menus with their pages', () => {
    expect(accountSections.map(({ section, href }) => [section, href])).toEqual([
      ['orders', '/customer/orders'],
      ['stores', '/customer/stores'],
      ['data', '/customer/account'],
      ['fittings', '/customer/fittings'],
      ['photos', '/customer/photos'],
    ]);
    expect(accountSections.map(({ title }) => title)).toEqual([
      'Мои заказы',
      'Магазины',
      'Мои данные',
      'Мои примерки',
      'Мои фото',
    ]);
  });

  it('loads only the stores page in full', () => {
    expect(
      accountSections.filter(({ fullLoad }) => fullLoad).map(({ section }) => section),
    ).toEqual(['stores']);
  });

  it('has the same keys as the values of the profile menu section property', () => {
    const property = catalog.elements['profile-menu.section'].properties.section;
    expect(accountSections.map(({ section }) => section)).toEqual(property.values);
  });
});
