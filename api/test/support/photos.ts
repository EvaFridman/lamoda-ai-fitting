import sharp, { type Sharp } from 'sharp';

import { REFUSAL_COLOURS } from '../../src/ai/ai-provider.js';
import type { PhotoRefusalReason } from '../../src/ai/checks/photo-checker.js';

export type PhotoFormat = 'jpeg' | 'png' | 'webp';

export interface PhotoOptions {
  format?: PhotoFormat;
  width?: number;
  height?: number;
  // An EXIF orientation tag (6: turned a quarter clockwise), JPEG only.
  orientation?: number;
}

// Images for the upload's e2e and for a check by hand (spec 0019 plan §11). The fake provider
// refuses a solid-colour photo by its colour (ai-provider.ts, REFUSAL_COLOURS) and accepts any
// other; the upload re-encodes them, so the marker must be in the pixels, not the bytes.

// A photo the check accepts: gaussian noise, never one colour.
export function goodPhoto(options: PhotoOptions = {}): Promise<Buffer> {
  const { width = 64, height = 96 } = options;
  return encode(
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    }),
    options,
  );
}

// A photo the fake check refuses with `reason`.
export function refusedPhoto(
  reason: PhotoRefusalReason,
  options: PhotoOptions = {},
): Promise<Buffer> {
  const { width = 64, height = 96 } = options;
  const [r, g, b] = REFUSAL_COLOURS[reason];
  return encode(
    sharp({ create: { width, height, channels: 3, background: { r, g, b } } }),
    options,
  );
}

function encode(image: Sharp, { format = 'jpeg', orientation }: PhotoOptions): Promise<Buffer> {
  const encoded = format === 'jpeg' ? image.jpeg() : format === 'png' ? image.png() : image.webp();
  return (orientation === undefined ? encoded : encoded.withMetadata({ orientation })).toBuffer();
}
