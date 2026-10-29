'use client';

// A client module: `@/shared/lib` is imported by server components too, which may not reach a
// client-only React API.
import { useEffect, useState } from 'react';

/**
 * The value once it has stayed the same for `delayMs`. With `atOnce` (an emptied field, a value
 * restored on hydration) it is the value in this very render, and a later value waits from it, so
 * nothing older comes back. An object or array passed with `atOnce` keeps its reference between
 * renders, or every render stores it again without end.
 */
export function useDebounced<T>(value: T, delayMs: number, atOnce = false): T {
  const [debounced, setDebounced] = useState(value);
  if (atOnce && !Object.is(debounced, value)) setDebounced(value);

  useEffect(() => {
    if (atOnce) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, atOnce]);

  return atOnce ? value : debounced;
}
