import { SITE_NAME } from '@/shared/config';

// The link preview image of every catalog page (plan §3.5, O28): `app/catalog/opengraph-image.tsx`
// and `twitter-image.tsx` serve it.
export const previewImageAlt = SITE_NAME;
export const previewImageSize = { width: 1200, height: 630 };
export const previewImageContentType = 'image/png';

// A category page names it itself: Next adds a segment's image files to that segment's own
// metadata, and a category's `openGraph` replaces the catalog's (plan §3.5).
export function previewImages(path: '/catalog/opengraph-image' | '/catalog/twitter-image') {
  return [{ url: path, alt: previewImageAlt, type: previewImageContentType, ...previewImageSize }];
}
