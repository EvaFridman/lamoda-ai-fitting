import { describe, expect, it } from 'vitest';

import { userPhotoKeys } from './keys';
import { myPhotosQueryOptions } from './queries';

const TEN_MINUTES = 10 * 60_000;

describe('myPhotosQueryOptions', () => {
  // The links are signed for 15 minutes: the list is read again before they expire.
  it('reads the list again every 10 minutes, and when the tab is focused, under the photos key', () => {
    const options = myPhotosQueryOptions();
    expect(options.queryKey).toEqual(userPhotoKeys.all);
    expect(options.staleTime).toBe(TEN_MINUTES);
    expect(options.refetchInterval).toBe(TEN_MINUTES);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it('refreshes before a 15 minute link expires', () => {
    const options = myPhotosQueryOptions();
    expect(options.staleTime).toBeLessThan(15 * 60_000);
    expect(options.refetchInterval).toBeLessThan(15 * 60_000);
  });
});
