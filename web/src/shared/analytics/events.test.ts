import { describe, expect, it, vi } from 'vitest';

import { defineCatalog } from './catalog';
import { track } from './client';
import type { AnalyticsEventName, AnalyticsEvents, EventsOf } from './events';
import type { UseTrackedElementOf } from './use-tracked-element';

vi.mock('./client', () => ({ track: vi.fn() }));

// No migrated entry has properties, so the cases with properties use a catalog of their own
// (spec 0015 plan §2).
const testCatalog = defineCatalog({
  visitsPerMonth: 1,
  sdkPerVisit: 1,
  zones: { shop: { title: 'Магазин', areas: ['shop'], description: '…' } },
  commonEvents: {
    'Element Clicked': { description: '…' },
    'Element Hovered': { description: '…' },
  },
  events: {
    'Shop Sorted': {
      zone: 'shop',
      type: 'interaction',
      description: '…',
      perVisit: 1,
      properties: { sort: { kind: 'enum', values: ['price', 'new'] } },
    },
  },
  elements: {
    'shop.card': {
      zone: 'shop',
      type: 'navigation',
      description: '…',
      clicksPerVisit: 1,
      hoversPerVisit: 1,
      properties: { position: { kind: 'number' }, sale: { kind: 'boolean' } },
    },
    'shop.logo': {
      zone: 'shop',
      type: 'navigation',
      description: '…',
      clicksPerVisit: 1,
      hoversPerVisit: 1,
    },
  },
});

declare const testTrack: <N extends keyof EventsOf<typeof testCatalog>>(
  name: N,
  properties: EventsOf<typeof testCatalog>[N],
) => void;
declare const useTestElement: UseTrackedElementOf<typeof testCatalog>;

// The assertions are for the type checker (`npm run typecheck`, spec 0015 AC1, AC6): an unused
// `@ts-expect-error` fails it. Each case sits in a function that never runs.
describe('analytics event types', () => {
  it('accepts the listed events', () => {
    track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
    track('Element Hovered', { element: 'login.google', zone: 'auth', type: 'interaction' });
    track('Signed In', {});
    const names: AnalyticsEventName[] = ['Element Clicked', 'Login Opened', 'Signed Out'];
    const props: AnalyticsEvents['Element Clicked'] = {
      element: 'profile-menu.sign-out',
      zone: 'auth',
      type: 'interaction',
    };
    expect(names).toHaveLength(3);
    expect(props.element).toBe('profile-menu.sign-out');
  });

  it('rejects anything else at compile time', () => {
    // @ts-expect-error unknown event name
    track('Unknown Event', { element: 'ui-kit.button-primary' });
    // @ts-expect-error unknown element
    track('Element Clicked', { element: 'nowhere', zone: 'service', type: 'service' });
    // @ts-expect-error missing property
    track('Element Clicked', {});
    track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
      // @ts-expect-error extra property
      extra: 1,
    });
    // @ts-expect-error another element's zone
    track('Element Clicked', { element: 'ui-kit.button-primary', zone: 'auth', type: 'service' });
    // @ts-expect-error another element's type
    track('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'interaction',
    });
    // @ts-expect-error a property on an event without them
    track('Signed In', { extra: 1 });
    expect(track).toHaveBeenCalledWith('Element Clicked', {});
  });

  it('checks properties against the catalog', () => {
    // A hook by name only: it never runs.
    function useCases() {
      testTrack('Shop Sorted', { sort: 'price' });
      testTrack('Element Clicked', {
        element: 'shop.card',
        zone: 'shop',
        type: 'navigation',
        position: 1,
        sale: false,
      });
      testTrack('Element Clicked', { element: 'shop.logo', zone: 'shop', type: 'navigation' });
      useTestElement('shop.card', { position: 2, sale: true });
      useTestElement('shop.logo');

      // @ts-expect-error a value outside the enum
      testTrack('Shop Sorted', { sort: 'name' });
      // @ts-expect-error an undeclared property
      testTrack('Shop Sorted', { sort: 'price', query: 'x' });
      // @ts-expect-error an element's property missing
      testTrack('Element Clicked', {
        element: 'shop.card',
        zone: 'shop',
        type: 'navigation',
        position: 1,
      });
      testTrack('Element Clicked', {
        element: 'shop.logo',
        zone: 'shop',
        type: 'navigation',
        // @ts-expect-error a property of another element
        position: 1,
      });
      // @ts-expect-error the element's properties missing
      useTestElement('shop.card');
      // @ts-expect-error a property of the wrong kind
      useTestElement('shop.card', { position: '2', sale: true });
      // @ts-expect-error an undeclared element property
      useTestElement('shop.card', { position: 2, sale: true, id: 7 });
      // @ts-expect-error properties for an element without them
      useTestElement('shop.logo', { position: 1 });

      // A union of elements, one with properties, cannot skip them (or pass any).
      const either = 'shop.card' as 'shop.card' | 'shop.logo';
      // @ts-expect-error the properties of `shop.card` skipped
      useTestElement(either);
      // @ts-expect-error no properties fit both
      useTestElement(either, { position: 1, sale: true });
    }
    expect(useCases).toBeTypeOf('function');
  });

  it('refuses a malformed catalog', () => {
    const base = {
      visitsPerMonth: 1,
      sdkPerVisit: 1,
      zones: { shop: { title: '…', areas: ['shop'], description: '…' } },
      commonEvents: {
        'Element Clicked': { description: '…' },
        'Element Hovered': { description: '…' },
      },
    } as const;
    function cases() {
      defineCatalog({
        ...base,
        events: {},
        elements: {
          'shop.search': {
            zone: 'shop',
            type: 'interaction',
            description: '…',
            clicksPerVisit: 1,
            hoversPerVisit: 1,
            // @ts-expect-error a free-text property (AC6)
            properties: { query: { kind: 'string' } },
          },
        },
      });
      defineCatalog({
        ...base,
        events: {
          'Shop Opened': {
            // @ts-expect-error a zone that `zones` does not list
            zone: 'nowhere',
            type: 'interaction',
            description: '…',
            perVisit: 1,
            properties: {},
          },
        },
        elements: {},
      });
      defineCatalog({
        ...base,
        events: {},
        elements: {
          'shop.logo': {
            // @ts-expect-error a type outside the four
            type: 'goal',
            zone: 'shop',
            description: '…',
            clicksPerVisit: 1,
            hoversPerVisit: 1,
          },
        },
      });
      defineCatalog({
        ...base,
        events: {},
        elements: {
          'shop.logo': {
            // @ts-expect-error an element's zone that `zones` does not list
            zone: 'nowhere',
            type: 'navigation',
            description: '…',
            clicksPerVisit: 1,
            hoversPerVisit: 1,
          },
        },
      });
      defineCatalog({
        ...base,
        events: {},
        elements: {
          'shop.card': {
            zone: 'shop',
            type: 'navigation',
            description: '…',
            clicksPerVisit: 1,
            hoversPerVisit: 1,
            // @ts-expect-error an own property that would replace the automatic `type`
            properties: { type: { kind: 'boolean' } },
          },
        },
      });
      defineCatalog({
        ...base,
        events: {
          'Shop Opened': {
            zone: 'shop',
            type: 'interaction',
            description: '…',
            perVisit: 1,
            // @ts-expect-error a property Mixpanel reserves
            properties: { time: { kind: 'number' } },
          },
        },
        elements: {},
      });
      defineCatalog({
        ...base,
        events: {},
        elements: {
          'shop.logo': {
            zone: 'shop',
            type: 'navigation',
            description: '…',
            clicksPerVisit: 1,
            hoversPerVisit: 1,
            // @ts-expect-error a Mixpanel `mp_` property
            properties: { mp_lib: { kind: 'boolean' } },
          },
        },
      });
      defineCatalog({
        ...base,
        events: {
          // @ts-expect-error a generic event outside `commonEvents`
          'Element Clicked': {
            zone: 'shop',
            type: 'interaction',
            description: '…',
            perVisit: 1,
            properties: {},
          },
        },
        elements: {},
      });
    }
    expect(cases).toBeTypeOf('function');
  });
});
