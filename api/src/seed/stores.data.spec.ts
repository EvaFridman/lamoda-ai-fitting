import { describe, expect, it } from 'vitest';

import { StoreType } from '../generated/prisma/enums.js';
import { STORES, type SeedStore } from './stores.data.js';

const TEXT_FIELDS = ['name', 'city', 'street', 'house', 'mall', 'workTime', 'description'] as const;

const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

function expectCleanText(value: string, label: string): void {
  expect(value, label).not.toBe('');
  expect(value, label).toBe(value.trim());
  expect(value, label).not.toMatch(/\s{2}/);
  expect(value, label).not.toContain(' ');
  expect(value, label).not.toMatch(ENTITY);
}

describe('STORES', () => {
  it('is not empty', () => {
    expect(STORES.length).toBeGreaterThan(0);
  });

  it('has unique codes of four lower-case letters or digits', () => {
    const codes = STORES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z0-9]{4}$/);
    }
  });

  it.each(TEXT_FIELDS)(
    'keeps %s trimmed, not empty, without double spaces or HTML entities',
    (field) => {
      for (const store of STORES) {
        expectCleanText(store[field], `${store.code} ${field}`);
      }
    },
  );

  it('keeps the metro stations and phones trimmed, not empty and without duplicates', () => {
    for (const store of STORES) {
      for (const field of ['metroStations', 'phones'] as const) {
        const list: string[] = store[field];
        expect(Array.isArray(list), `${store.code} ${field}`).toBe(true);
        for (const item of list) {
          expectCleanText(item, `${store.code} ${field}`);
        }
        expect(new Set(list).size, `${store.code} ${field}`).toBe(list.length);
      }
    }
  });

  it('puts every store on the globe', () => {
    for (const { code, latitude, longitude } of STORES) {
      expect(Number.isFinite(latitude), code).toBe(true);
      expect(Number.isFinite(longitude), code).toBe(true);
      expect(latitude, code).toBeGreaterThanOrEqual(-90);
      expect(latitude, code).toBeLessThanOrEqual(90);
      expect(longitude, code).toBeGreaterThanOrEqual(-180);
      expect(longitude, code).toBeLessThanOrEqual(180);
    }
  });

  it('gives every store a type of the enum', () => {
    const types: string[] = Object.values(StoreType);
    for (const store of STORES as readonly SeedStore[]) {
      expect(types, store.code).toContain(store.type);
    }
  });
});
