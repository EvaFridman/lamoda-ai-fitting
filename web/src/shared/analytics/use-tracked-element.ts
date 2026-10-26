'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type PointerEvent } from 'react';

import { catalog, type Catalog } from './catalog';
import { track } from './client';
import type {
  AnalyticsEvents,
  ElementArgumentsOf,
  ElementPropertiesOf,
  ElementsOf,
} from './events';

/** A hover counts after this long, at most once per element per page view (spec 0008 J8). */
export const HOVER_MS = 500;

type PropertyValues = Readonly<Record<string, string | number | boolean>>;

/**
 * The key of a hover sent once per page view (spec 0015 R13): the element and, for an element
 * with properties, their values in the catalog's order, so a card at positions 1 and 2 is two keys.
 */
export function hoverKey<C extends Catalog, E extends ElementsOf<C>>(
  element: E,
  properties: ElementPropertiesOf<C, E>,
  of: C,
): string {
  const names = Object.keys(of.elements[element]?.properties ?? {});
  const values: PropertyValues = properties;
  return JSON.stringify([element, ...names.map((name) => values[name])]);
}

// Hover keys sent on the path `hoveredOn`, shared by every copy of an element.
// `useHoverReset()` clears it on every navigation; the path check covers a page without it.
const hovered = new Set<string>();
let hoveredOn: string | undefined;

/**
 * Starts a new page view for hovers on every path change, including a return to a path after a
 * page with no tracked element. Mounted once, where every navigation is seen (`AnalyticsGate`).
 */
export function useHoverReset(): void {
  const pathname = usePathname();
  useEffect(() => {
    hovered.clear();
    hoveredOn = pathname;
  }, [pathname]);
}

type ElementEvent = AnalyticsEvents['Element Clicked'];

function sendHover(key: string, event: ElementEvent, pathname: string): void {
  if (hoveredOn !== pathname) {
    hovered.clear();
    hoveredOn = pathname;
  }
  if (hovered.has(key)) return;
  hovered.add(key);
  track('Element Hovered', event);
}

type TrackedElementProps = {
  onClick: () => void;
  onPointerEnter: (event: PointerEvent) => void;
  onPointerLeave: () => void;
};

/** `useTrackedElement` for a catalog: an element with properties requires them. */
export type UseTrackedElementOf<C extends Catalog> = <E extends ElementsOf<C>>(
  element: E,
  ...properties: ElementArgumentsOf<C, E>
) => TrackedElementProps;

function elementEvent(element: string, properties: PropertyValues): ElementEvent {
  const elements: Catalog['elements'] = catalog.elements;
  const entry = elements[element];
  // Only the properties the catalog declares are sent: a variable passed in may carry more than
  // its type shows (R7). The types allow only a listed element (AC1).
  const declared = Object.keys(entry?.properties ?? {}).filter((name) =>
    Object.hasOwn(properties, name),
  );
  const own = Object.fromEntries(declared.map((name) => [name, properties[name]]));
  return { ...own, element, zone: entry?.zone, type: entry?.type } as ElementEvent;
}

function trackClickOf(element: string, properties: PropertyValues = {}): void {
  track('Element Clicked', elementEvent(element, properties));
}

/**
 * The click of a listed element outside a component, where no hook runs: a toast's action, whose
 * properties are known only when it is shown (spec 0019 A90.9). It has no hover.
 */
export const trackElementClick: <E extends ElementsOf<typeof catalog>>(
  element: E,
  ...properties: ElementArgumentsOf<typeof catalog, E>
) => void = trackClickOf;

function useTrackedElementOf(
  element: string,
  properties: PropertyValues = {},
): TrackedElementProps {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A hover started before a navigation does not count for the new page.
  useEffect(() => () => clearTimeout(timerRef.current), [pathname]);

  const event = elementEvent(element, properties);
  const key = hoverKey<Catalog, string>(element, properties, catalog);

  return {
    onClick: () => track('Element Clicked', event),
    onPointerEnter: (pointer: PointerEvent) => {
      if (pointer.pointerType !== 'mouse') return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => sendHover(key, event, pathname), HOVER_MS);
    },
    onPointerLeave: () => clearTimeout(timerRef.current),
  };
}

/**
 * Props to spread on a listed element: they send its click and hover events with its zone, type
 * and own properties (spec 0015 R5).
 */
export const useTrackedElement: UseTrackedElementOf<typeof catalog> = useTrackedElementOf;

/** `useTrackedElements` for a catalog. */
export type UseTrackedElementsOf<C extends Catalog> = <E extends ElementsOf<C>>(
  element: E,
) => (...properties: ElementArgumentsOf<C, E>) => TrackedElementProps;

function useTrackedElementsOf(
  element: string,
): (properties?: PropertyValues) => TrackedElementProps {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), [pathname]);

  return (properties = {}) => {
    const event = elementEvent(element, properties);
    const key = hoverKey<Catalog, string>(element, properties, catalog);
    return {
      onClick: () => track('Element Clicked', event),
      onPointerEnter: (pointer: PointerEvent) => {
        if (pointer.pointerType !== 'mouse') return;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => sendHover(key, event, pathname), HOVER_MS);
      },
      onPointerLeave: () => clearTimeout(timerRef.current),
    };
  };
}

/**
 * `useTrackedElement` for copies of one element that a kit component renders in a list of any
 * length, where no hook runs per copy (the gallery's photos by position): a function giving each
 * copy's props from its properties. The copies share one hover timer, as one pointer is over one
 * of them at a time.
 */
export const useTrackedElements: UseTrackedElementsOf<typeof catalog> = useTrackedElementsOf;
