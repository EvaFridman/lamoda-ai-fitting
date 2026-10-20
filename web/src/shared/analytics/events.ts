// The types `track` and `useTrackedElement` accept, derived from the catalog (spec 0015 R3, plan
// §2). Generic over a catalog's type, so tests check them on a small catalog of their own.
import type { Catalog, Properties, Property, catalog } from './catalog';

type ValueOf<P extends Property> = P extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : P extends { kind: 'number' }
    ? number
    : boolean;

// No properties forbids any (`{}` would accept an extra one).
type PropertiesOf<P extends Properties> = [keyof P] extends [never]
  ? Record<string, never>
  : { -readonly [K in keyof P]: ValueOf<P[K]> };

export type ElementsOf<C extends Catalog> = keyof C['elements'] & string;

// Adds nothing to an intersection (`Record<string, never>` would make `element` `never`).
type Nothing = Record<never, never>;

/** An element's own properties; nothing for an element without them. */
export type ElementPropertiesOf<
  C extends Catalog,
  E extends ElementsOf<C>,
> = C['elements'][E] extends { properties: infer P extends Properties }
  ? [keyof P] extends [never]
    ? Nothing
    : PropertiesOf<P>
  : Nothing;

// The members of `E` that declare properties.
type WithPropertiesOf<C extends Catalog, E extends ElementsOf<C>> = E extends unknown
  ? [keyof ElementPropertiesOf<C, E>] extends [never]
    ? never
    : E
  : never;

type IsUnion<T, All = T> = T extends unknown ? ([All] extends [T] ? false : true) : never;

/**
 * `useTrackedElement`'s arguments after the element: its properties, if it has any. A union of
 * elements one of which has properties takes none that fit, so it cannot skip them (AC1).
 */
export type ElementArgumentsOf<C extends Catalog, E extends ElementsOf<C>> = [
  WithPropertiesOf<C, E>,
] extends [never]
  ? []
  : true extends IsUnion<E>
    ? [properties: never]
    : [properties: ElementPropertiesOf<C, E>];

// One shape per element, so an element's properties go only with that element.
type ElementEventOf<C extends Catalog> = {
  [E in ElementsOf<C>]: {
    element: E;
    zone: C['elements'][E]['zone'];
    type: C['elements'][E]['type'];
  } & ElementPropertiesOf<C, E>;
}[ElementsOf<C>];

export type EventsOf<C extends Catalog> = {
  [N in keyof C['events']]: PropertiesOf<C['events'][N]['properties']>;
} & {
  'Element Clicked': ElementEventOf<C>;
  'Element Hovered': ElementEventOf<C>;
};

/** Every element that sends click and hover events. */
export type TrackedElement = ElementsOf<typeof catalog>;

export type AnalyticsEvents = EventsOf<typeof catalog>;

export type AnalyticsEventName = keyof AnalyticsEvents;
