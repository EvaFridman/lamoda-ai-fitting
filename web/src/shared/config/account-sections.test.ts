import { describe, expect, it } from 'vitest';

import { catalog } from '@/shared/analytics/catalog';

import { accountSections } from './account-sections';

describe('accountSections', () => {
  it('lists the four sections in the order of the menus with their pages', () => {
    expect(accountSections.map(({ section, href }) => [section, href])).toEqual([
      ['orders', '/customer/orders'],
      ['stores', '/customer/stores'],
      ['data', '/customer/account'],
      ['fittings', '/customer/fittings'],
    ]);
    expect(accountSections.map(({ title }) => title)).toEqual([
      'Мои заказы',
      'Магазины',
      'Мои данные',
      'Мои примерки',
    ]);
  });

  it('has the same keys as the values of the profile menu section property', () => {
    const property = catalog.elements['profile-menu.section'].properties.section;
    expect(accountSections.map(({ section }) => section)).toEqual(property.values);
  });
});
