import { describe, expect, it } from 'vitest';

import { catalog } from './catalog';

describe('analytics catalog', () => {
  it('lists exactly the known events', () => {
    expect(Object.keys(catalog.events).sort()).toEqual(['Login Opened', 'Signed In', 'Signed Out']);
    expect(Object.keys(catalog.commonEvents).sort()).toEqual([
      'Element Clicked',
      'Element Hovered',
    ]);
  });

  it('gives each event its zone and type', () => {
    const summary = Object.fromEntries(
      Object.entries(catalog.events).map(([name, { zone, type }]) => [name, [zone, type]]),
    );
    expect(summary).toEqual({
      'Login Opened': ['auth', 'interaction'],
      'Signed In': ['auth', 'conversion'],
      'Signed Out': ['auth', 'interaction'],
    });
  });

  it('lists exactly the known elements with their zone and type', () => {
    const summary = Object.fromEntries(
      Object.entries(catalog.elements).map(([name, { zone, type }]) => [name, [zone, type]]),
    );
    expect(summary).toEqual({
      'ui-kit.button-primary': ['service', 'service'],
      'login.google': ['auth', 'interaction'],
      'profile-menu.sign-out': ['auth', 'interaction'],
      'profile-menu.sign-out-everywhere': ['auth', 'interaction'],
    });
  });

  it('uses only declared zones', () => {
    const zones = Object.keys(catalog.zones);
    for (const entry of [...Object.values(catalog.events), ...Object.values(catalog.elements)]) {
      expect(zones).toContain(entry.zone);
    }
  });
});
