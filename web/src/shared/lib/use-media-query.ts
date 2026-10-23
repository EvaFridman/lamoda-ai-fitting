'use client';

// A client module: `@/shared/lib` is imported by server components too, which may not reach a
// client-only React API.
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the window matches a media query, following its changes. `false` on the server, on
 * hydration and where the browser has no `matchMedia` (jsdom), so the wide layout is the default.
 */
export function useMediaQuery(query: string): boolean {
  // One subscription per query, not one per render.
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
