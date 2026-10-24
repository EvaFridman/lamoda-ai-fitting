import { type RefObject, useEffect } from 'react';

// The body's variable `body:has([data-fixed-bar])` pads the page's end with (`app/globals.scss`).
export const FIXED_BAR_HEIGHT_VAR = '--fixed-bar-height';

// Keeps the bar's own height in the body's variable while the bar is mounted, so the page's end,
// the footer too, stays clear of it on a phone whatever its rows, its text's wrapping or the
// system's font size (spec 0019 A82). Without ResizeObserver the stylesheet's fallback holds.
export function useFixedBarHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const bar = ref.current;
    if (bar === null || typeof ResizeObserver === 'undefined') return;
    const style = document.body.style;
    const observer = new ResizeObserver(() => {
      style.setProperty(FIXED_BAR_HEIGHT_VAR, `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    });
    // The border box: a change of the bar's own padding (a safe area appearing) counts too.
    observer.observe(bar, { box: 'border-box' });
    return () => {
      observer.disconnect();
      style.removeProperty(FIXED_BAR_HEIGHT_VAR);
    };
  }, [ref]);
}
