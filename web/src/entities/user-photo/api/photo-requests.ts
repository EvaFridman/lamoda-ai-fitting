import { buildPath, clientFetch } from '@/shared/api';

import { userPhotoSchema, type UserPhoto } from '../model/schemas';

// The upload's own timeout: the browser's timer covers sending a photo of up to 20 MB on a slow
// line, then the api's check (spec 0019 plan §7).
export const UPLOAD_TIMEOUT_MS = 120_000;

export interface UploadPhotoOptions {
  // `false` makes a one-time photo, not among the saved ones (spec 0019 A24). The api's default is
  // `true`.
  save?: boolean;
  signal?: AbortSignal;
}

// POST /me/photos: the stored photo. The body is multipart with the parts `photo` and `save`; the
// browser sets its Content-Type with the boundary. Errors are `ApiError`s, already reported; the
// caller shows them (the details `IS_IMAGE` and `PHOTO_REFUSED`, 409 `LIMIT_REACHED`).
export function uploadPhoto(
  photo: Blob,
  { save = true, signal }: UploadPhotoOptions = {},
): Promise<UserPhoto> {
  const body = new FormData();
  body.append('save', String(save));
  body.append('photo', photo);
  return clientFetch(
    buildPath('/me/photos'),
    userPhotoSchema,
    { method: 'POST', body, signal },
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  );
}

// PATCH /me/photos/:id: makes this photo the default. The default is moved, never cleared (A59).
export function setDefaultPhoto(id: string): Promise<UserPhoto> {
  return clientFetch(buildPath('/me/photos/:id', { id }), userPhotoSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDefault: true }),
  });
}

// DELETE /me/photos/:id: a 204. No other photo becomes the default (A59).
export function deletePhoto(id: string): Promise<undefined> {
  return clientFetch(buildPath('/me/photos/:id', { id }), null, { method: 'DELETE' });
}

// DELETE /me/photos/transient/:id: a 204. The try-on calls it when it closes; a photo a running
// fitting uses stays for the housekeeping, and a saved one is a 404 (spec 0019 A70).
export function deleteTransientPhoto(id: string): Promise<undefined> {
  return clientFetch(buildPath('/me/photos/transient/:id', { id }), null, { method: 'DELETE' });
}
