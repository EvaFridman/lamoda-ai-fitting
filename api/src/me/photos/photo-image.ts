import sharp from 'sharp';

// The stored form of a fitting photo (spec 0019 A31): WebP of at most PHOTO_MAX_SIDE on the longer
// side, turned the way its EXIF orientation says, with no metadata (no EXIF, GPS or ICC profile;
// sharp drops them unless asked to keep them).
export const PHOTO_MAX_SIDE = 2048;
// Decoded pixels an upload may hold: a PNG of 20 MB can decode to far more than its size (a
// decompression bomb). 50 MP is above any phone's photo (48 MP at most). sharp's own default is
// 268 MP; a PNG or WebP of 50 MP decodes to about 150 MB for the time of the request (A55).
export const PHOTO_MAX_INPUT_PIXELS = 50_000_000;
// Found by sharp from the bytes, never from the part's content type or the file's name. HEIC is
// not accepted (A31), nor GIF, SVG or TIFF.
const INPUT_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp']);

export interface FittingPhoto {
  webp: Buffer;
  // Of the WebP, after the rotation and the resize.
  width: number;
  height: number;
}

// The upload is not a readable JPG, PNG or WebP: a text file, another image format, a truncated
// image or one over the pixel limit. The route answers the detail IS_IMAGE for it; `cause` is
// sharp's error, whose message names the problem and holds no bytes, for the log. A failure of
// sharp itself (libvips missing, no memory) lands here too, since sharp does not tell them apart:
// the log line shows which.
export class NotAnImageError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Not an accepted image');
    this.name = 'NotAnImageError';
    this.cause = cause;
  }
}

export async function toFittingPhoto(input: Buffer): Promise<FittingPhoto> {
  try {
    const image = sharp(input, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS });
    const { format } = await image.metadata();
    if (format === undefined || !INPUT_FORMATS.has(format)) {
      throw new Error(`Input image format ${format ?? 'unknown'} is not accepted`);
    }
    const { data, info } = await image
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer({ resolveWithObject: true });
    return { webp: data, width: info.width, height: info.height };
  } catch (error) {
    throw new NotAnImageError(error);
  }
}
