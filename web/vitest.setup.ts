// Matchers such as `toBeChecked` and `toHaveAccessibleName` for `expect`, with their types.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts after each test on its own only when Vitest globals are on; they are
// off (tests import `describe`, `it`, `expect`), so it is done here.
afterEach(() => {
  cleanup();
});
