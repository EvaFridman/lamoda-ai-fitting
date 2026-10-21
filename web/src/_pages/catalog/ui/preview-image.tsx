import 'server-only';

import { ImageResponse } from 'next/og';

import { SITE_NAME } from '@/shared/config';

import { previewImageSize } from '../model/preview-image';

// The link preview of every catalog page (plan §3.5, O28): one static image, built with the app.
// Latin letters in the default font only, so no font is fetched at build or run time.
export function PreviewImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        color: '#000000',
        fontSize: 96,
      }}
    >
      {SITE_NAME}
    </div>,
    previewImageSize,
  );
}
