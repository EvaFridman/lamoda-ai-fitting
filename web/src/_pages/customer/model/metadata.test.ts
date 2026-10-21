import { describe, expect, it } from 'vitest';

import { accountLayoutMetadata, accountSectionMetadata } from './metadata';

describe('accountLayoutMetadata', () => {
  it('closes every account page to search engines', () => {
    expect(accountLayoutMetadata.robots).toEqual({ index: false, follow: false });
  });

  it('titles the pages with the site name', () => {
    expect(accountLayoutMetadata.title).toEqual({
      template: '%s — Lamoda AI Fitting',
      default: 'Личный кабинет — Lamoda AI Fitting',
    });
  });
});

describe('accountSectionMetadata', () => {
  it.each([
    ['orders', 'Мои заказы'],
    ['stores', 'Магазины'],
    ['data', 'Мои данные'],
    ['fittings', 'Мои примерки'],
  ] as const)('titles the %s section "%s"', (section, title) => {
    expect(accountSectionMetadata(section).title).toBe(title);
  });
});
