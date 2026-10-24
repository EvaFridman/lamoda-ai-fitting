import { describe, expect, it } from 'vitest';

import { fittingFingerprint, type FingerprintInput } from './fingerprint.js';

const PHOTO = '0199aaaa-0000-7000-8000-000000000001';
const SHIRT = '0199aaaa-0000-7000-8000-0000000000a1';
const JEANS = '0199aaaa-0000-7000-8000-0000000000b2';
const RED = '0199aaaa-0000-7000-8000-0000000000c1';
const BLUE = '0199aaaa-0000-7000-8000-0000000000c2';

const base: FingerprintInput = {
  photoId: PHOTO,
  items: [
    { productId: SHIRT, attributeValueId: RED },
    { productId: JEANS, attributeValueId: null },
  ],
  promptText: 'brighter',
};

describe('fittingFingerprint', () => {
  it('is 64 lower-case hex characters', () => {
    expect(fittingFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the same for the same input', () => {
    expect(fittingFingerprint({ ...base })).toBe(fittingFingerprint(base));
  });

  it('does not depend on the order of the items', () => {
    const reversed = { ...base, items: [...base.items].reverse() };

    expect(fittingFingerprint(reversed)).toBe(fittingFingerprint(base));
  });

  it('does not change the order of the caller’s items', () => {
    const items = [...base.items];

    fittingFingerprint({ ...base, items });

    expect(items).toEqual(base.items);
  });

  it.each([
    ['another photo', { photoId: '0199aaaa-0000-7000-8000-000000000002' }],
    ['another colour', { items: [{ productId: SHIRT, attributeValueId: BLUE }, base.items[1]!] }],
    ['no colour', { items: [{ productId: SHIRT, attributeValueId: null }, base.items[1]!] }],
    ['another product', { items: [{ productId: SHIRT, attributeValueId: RED }] }],
    ['another text', { promptText: 'darker' }],
    ['no text', { promptText: null }],
  ] satisfies [string, Partial<FingerprintInput>][])('differs for %s', (_name, change) => {
    expect(fittingFingerprint({ ...base, ...change })).not.toBe(fittingFingerprint(base));
  });

  it('tells a colour from no colour on another item', () => {
    const swapped = {
      ...base,
      items: [
        { productId: SHIRT, attributeValueId: null },
        { productId: JEANS, attributeValueId: RED },
      ],
    };

    expect(fittingFingerprint(swapped)).not.toBe(fittingFingerprint(base));
  });

  it('tells an empty text from none', () => {
    expect(fittingFingerprint({ ...base, promptText: '' })).not.toBe(
      fittingFingerprint({ ...base, promptText: null }),
    );
  });
});
