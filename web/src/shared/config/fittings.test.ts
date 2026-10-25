import { describe, expect, it } from 'vitest';

import { compareHref, FITTINGS_COMPARE_HREF } from '@/shared/config';

describe('compareHref', () => {
  it('points to the compare page with both ids', () => {
    expect(compareHref('aa', 'bb')).toBe('/customer/fittings/compare?a=aa&b=bb');
    expect(compareHref('aa', 'bb').startsWith(FITTINGS_COMPARE_HREF)).toBe(true);
  });

  it('encodes the ids', () => {
    expect(compareHref('a&b', 'c d')).toBe('/customer/fittings/compare?a=a%26b&b=c+d');
  });
});
