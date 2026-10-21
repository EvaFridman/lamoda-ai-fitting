import { describe, expect, it } from 'vitest';

import { previewImages } from './preview-image';

describe('previewImages', () => {
  it.each(['/catalog/opengraph-image', '/catalog/twitter-image'] as const)(
    'describes %s as a 1200 by 630 png',
    (path) => {
      expect(previewImages(path)).toEqual([
        { url: path, alt: 'Lamoda AI Fitting', type: 'image/png', width: 1200, height: 630 },
      ]);
    },
  );
});
