import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { goodPhoto } from '../../../test/support/photos.js';
import { NotAnImageError, PHOTO_MAX_SIDE, toFittingPhoto } from './photo-image.js';

async function solid(
  width: number,
  height: number,
  format: 'gif' | 'tiff' | 'jpeg',
): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  });
  return (
    format === 'gif' ? image.gif() : format === 'tiff' ? image.tiff() : image.jpeg()
  ).toBuffer();
}

describe('toFittingPhoto', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'turns a %s into a WebP of the same size',
    async (format) => {
      const result = await toFittingPhoto(await goodPhoto({ format, width: 64, height: 96 }));

      expect(result).toMatchObject({ width: 64, height: 96 });
      const meta = await sharp(result.webp).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 64, height: 96 });
    },
  );

  it('applies the EXIF orientation: a 64x32 JPEG turned by 6 is 32x64', async () => {
    const result = await toFittingPhoto(await goodPhoto({ width: 64, height: 32, orientation: 6 }));

    expect(result).toMatchObject({ width: 32, height: 64 });
    expect(await sharp(result.webp).metadata()).toMatchObject({ width: 32, height: 64 });
  });

  it('fits a 3000x1000 photo into 2048 px on the longer side', async () => {
    const result = await toFittingPhoto(await goodPhoto({ width: 3000, height: 1000 }));

    expect(PHOTO_MAX_SIDE).toBe(2048);
    expect(result).toMatchObject({ width: 2048, height: 683 });
    expect(await sharp(result.webp).metadata()).toMatchObject({ width: 2048, height: 683 });
  });

  it('does not enlarge a small photo', async () => {
    const result = await toFittingPhoto(await goodPhoto({ width: 10, height: 10 }));

    expect(result).toMatchObject({ width: 10, height: 10 });
  });

  it('drops the metadata: no EXIF, ICC profile or orientation', async () => {
    const input = await sharp(await goodPhoto({ width: 32, height: 32 }))
      .withMetadata({ orientation: 6 })
      .withIccProfile('srgb')
      .toBuffer();
    expect(await sharp(input).metadata()).toMatchObject({ orientation: 6 });

    const result = await toFittingPhoto(input);

    const meta = await sharp(result.webp).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it.each([
    ['a text buffer', () => Promise.resolve(Buffer.from('not an image at all'))],
    ['an empty buffer', () => Promise.resolve(Buffer.alloc(0))],
    ['a GIF', () => solid(8, 8, 'gif')],
    ['a TIFF', () => solid(8, 8, 'tiff')],
    ['an SVG', () => Promise.resolve(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))],
  ])('throws NotAnImageError for %s', async (_label, make) => {
    await expect(toFittingPhoto(await make())).rejects.toBeInstanceOf(NotAnImageError);
  });

  it('carries the cause and its message in the error', async () => {
    const error: unknown = await toFittingPhoto(Buffer.from('not an image')).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(NotAnImageError);
    const { cause, message } = error as NotAnImageError;
    expect(cause).toBeInstanceOf(Error);
    expect(message).toBe((cause as Error).message);
    expect(message).not.toBe('');
  });

  it('names the refused format for a GIF', async () => {
    await expect(toFittingPhoto(await solid(8, 8, 'gif'))).rejects.toThrow(/gif/i);
  });

  it('throws NotAnImageError for a truncated image', async () => {
    const whole = await solid(64, 64, 'jpeg');

    await expect(toFittingPhoto(whole.subarray(0, 40))).rejects.toBeInstanceOf(NotAnImageError);
  });

  it('throws NotAnImageError for an image over 50 megapixels', async () => {
    const huge = await sharp({
      create: { width: 8000, height: 6400, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(toFittingPhoto(huge)).rejects.toBeInstanceOf(NotAnImageError);
  });
});
