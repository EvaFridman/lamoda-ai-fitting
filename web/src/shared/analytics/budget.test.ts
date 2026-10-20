import { describe, expect, it } from 'vitest';

import { estimateMonthly } from './budget';
import type { Catalog } from './catalog';

const element = { zone: 'z', type: 'interaction', description: '' } as const;
const event = { ...element, properties: {} };

const testCatalog: Catalog = {
  visitsPerMonth: 1_000,
  sdkPerVisit: 4,
  zones: { z: { title: 'Z', areas: ['a'], description: '' } },
  commonEvents: {
    'Element Clicked': { description: '' },
    'Element Hovered': { description: '' },
  },
  events: { One: { ...event, perVisit: 0.5 }, Two: { ...event, perVisit: 0.25 } },
  elements: {
    'a.one': { ...element, clicksPerVisit: 1, hoversPerVisit: 2 },
    'a.two': { ...element, clicksPerVisit: 0.5, hoversPerVisit: 0 },
  },
};

describe('estimateMonthly', () => {
  it('sums each part per visit and multiplies it by the visits a month', () => {
    expect(estimateMonthly(testCatalog)).toEqual({
      events: { perVisit: 0.75, perMonth: 750 },
      clicks: { perVisit: 1.5, perMonth: 1_500 },
      hovers: { perVisit: 2, perMonth: 2_000 },
      sdk: { perVisit: 4, perMonth: 4_000 },
      total: { perVisit: 8.25, perMonth: 8_250 },
    });
  });

  it('counts only the SDK for an empty catalog', () => {
    const estimate = estimateMonthly({ ...testCatalog, events: {}, elements: {} });
    expect(estimate.events.perMonth).toBe(0);
    expect(estimate.clicks.perMonth).toBe(0);
    expect(estimate.hovers.perMonth).toBe(0);
    expect(estimate.total.perMonth).toBe(4_000);
  });
});
