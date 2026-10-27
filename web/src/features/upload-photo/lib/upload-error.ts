import { ApiError, detailText, errorText } from '@/shared/api';

// The api's `FITTING_PHOTO_MAX_BYTES` (spec 0019 A31) less the multipart body's own bytes, which
// nginx's 20 MB counts too: a bigger file is refused here, before its upload; nginx and the api
// refuse it all the same.
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024 - 64 * 1024;
export const TOO_BIG_TEXT = 'Файл слишком большой: нужно фото до 20 МБ';

// The file types the picker offers (A31): no HEIC, so iOS hands over a JPEG.
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const WRONG_TYPE_TEXT = 'Нужно изображение JPG, PNG или WebP';

const PHOTO_TYPES = new Set(PHOTO_ACCEPT.split(','));

/** A dropped file of the types the picker offers (the picker's own `accept` filters the rest). */
export function isPhotoType(file: File): boolean {
  return PHOTO_TYPES.has(file.type);
}

/** The text of a failed upload: a detail's own text (`IS_IMAGE`) when the api named one. */
export function uploadErrorText(error: unknown): string {
  const detail = error instanceof ApiError && error.kind === 'http' ? error.details[0] : undefined;
  return detail ? detailText(detail) : errorText(error);
}
