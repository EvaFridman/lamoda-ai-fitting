'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type PointerEvent } from 'react';

import { track } from './client';
import type { TrackedElement } from './events';

/** A hover counts after this long, at most once per element per page view (spec 0008 J8). */
export const HOVER_MS = 500;

// Elements whose hover was sent on the path `hoveredOn`, shared by every copy of an element.
// `useHoverReset()` clears it on every navigation; the path check covers a page without it.
const hovered = new Set<TrackedElement>();
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

function sendHover(element: TrackedElement, pathname: string): void {
  if (hoveredOn !== pathname) {
    hovered.clear();
    hoveredOn = pathname;
  }
  if (hovered.has(element)) return;
  hovered.add(element);
  track('Element Hovered', { element });
}

/** Props to spread on a listed element: they send its click and hover events. */
export function useTrackedElement(element: TrackedElement) {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A hover started before a navigation does not count for the new page.
  useEffect(() => () => clearTimeout(timerRef.current), [pathname]);

  return {
    onClick: () => track('Element Clicked', { element }),
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => sendHover(element, pathname), HOVER_MS);
    },
    onPointerLeave: () => clearTimeout(timerRef.current),
  };
}
