import 'server-only';

import { ImageResponse } from 'next/og';

import { LAMODA_MARK_HEIGHT, LAMODA_MARK_WIDTH, LamodaMark } from '@/shared/ui';

// The PNG tab icons (spec 0024 Z5, Z31): the kit's «la» in white on black, as `app/icon.svg`.
// Static images, built with the app; no files of their own (web keeps no `public/`).
export const markIconContentType = 'image/png';
// The tab's fallback for a browser that shows no SVG icon (Z31).
export const pngIconSize = { width: 32, height: 32 };
// The home screen's icon.
export const appleIconSize = { width: 180, height: 180 };

function markIcon(size: { width: number; height: number }) {
  // The mark's width as in `icon.svg`: 20 of 32 px.
  const markWidth = Math.round((size.width * 20) / 32);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
      }}
    >
      <LamodaMark
        width={markWidth}
        height={(markWidth * LAMODA_MARK_HEIGHT) / LAMODA_MARK_WIDTH}
        fill="#ffffff"
      />
    </div>,
    size,
  );
}

export function PngIcon() {
  return markIcon(pngIconSize);
}

export function AppleIcon() {
  return markIcon(appleIconSize);
}
