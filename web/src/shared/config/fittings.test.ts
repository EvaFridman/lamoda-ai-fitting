import { describe, expect, it } from 'vitest';

import { FITTINGS_HREF, fittingHref } from './fittings';

describe('fittingHref', () => {
  it('opens the fitting on the history page', () => {
    expect(fittingHref('abc')).toBe(`${FITTINGS_HREF}?fitting=abc`);
  });

  it('encodes the id into the one query value', () => {
    expect(fittingHref('a&b=c d')).toBe('/customer/fittings?fitting=a%26b%3Dc%20d');
  });
});
