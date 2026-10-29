import { ApiError, detailText, errorText } from '@/shared/api';

// The api's `FITTING_PHOTO_MAX_BYTES` (spec 0019 A31) less the multipart body's own bytes, which
// nginx's 20 MB counts too: a bigger file is refused here, before its upload; nginx and the api
// refuse it all the same.
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024 - 64 * 1024;
export const TOO_BIG_TEXT = 'Файл слишком большой: нужно фото до 20 МБ';

// The file types the picker offers. HEIC only with a mouse (spec 0024 Z26.2): a touch device's
// picker that does not name it hands over a JPEG iOS made, faster than the browser's decoder; a
// HEIC dropped or pasted is decoded on any device. The extensions let a desktop that names no type
// for a HEIC (Windows without its codec) list it.
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
const HEIC_ACCEPT = 'image/heic,image/heif,.heic,.heif';
export const WRONG_TYPE_TEXT = 'Нужно изображение JPG, PNG, WebP или HEIC';
export const HEIC_FAILED_TEXT = 'Не удалось прочитать HEIC — попробуйте JPG';

/** The picker's `accept`: with HEIC under `MOUSE_QUERY`. */
export function photoAccept(mouse: boolean): string {
  return mouse ? `${PHOTO_ACCEPT},${HEIC_ACCEPT}` : PHOTO_ACCEPT;
}

// The chosen file's own format, before a HEIC's conversion (the upload events' `format`).
export type PhotoFormat = 'jpeg' | 'png' | 'webp' | 'heic';

// With the older and the vendors' names some galleries and systems give (`image/jpg` of Samsung's,
// a burst's `image/heic-sequence` on macOS).
const FORMAT_BY_TYPE: Record<string, PhotoFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/x-png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heic',
};
const FORMAT_BY_EXTENSION: Record<string, PhotoFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  heic: 'heic',
  heif: 'heic',
};

/**
 * The format of a photo the upload takes: by its type, or by its extension when the browser names
 * none or one it does not know (`application/octet-stream` of a `.heic` on some desktops);
 * `undefined` for anything else (a GIF, a PDF, a file the picker's «All files» let in).
 */
export function photoFormat(file: File): PhotoFormat | undefined {
  const byType = FORMAT_BY_TYPE[file.type.toLowerCase()];
  if (byType) return byType;
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  return extension ? FORMAT_BY_EXTENSION[extension] : undefined;
}

/** The text of a failed upload: a detail's own text (`IS_IMAGE`) when the api named one. */
export function uploadErrorText(error: unknown): string {
  const detail = error instanceof ApiError && error.kind === 'http' ? error.details[0] : undefined;
  return detail ? detailText(detail) : errorText(error);
}
