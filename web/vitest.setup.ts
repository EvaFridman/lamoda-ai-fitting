// Matchers such as `toBeChecked` and `toHaveAccessibleName` for `expect`, with their types.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Outside Next, `'use cache: remote'` is an inert string and `cacheLife` throws (no Next runtime):
// a cached read runs as a plain call. A test of the lifetimes reads `vi.mocked(cacheLife)`.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  cacheLife: vi.fn(),
}));

// Testing Library unmounts after each test on its own only when Vitest globals are on; they are
// off (tests import `describe`, `it`, `expect`), so it is done here.
afterEach(() => {
  cleanup();
});

// jsdom has no `matchMedia`. Here no media query matches and none ever changes; a test of a
// change stubs its own (`vi.stubGlobal('matchMedia', …)`). Tests in the node environment have no
// window at all.
if (typeof window !== 'undefined') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
}
