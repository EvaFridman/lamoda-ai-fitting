import { randomUUID } from 'node:crypto';

import { IMAGE_KEY, IMAGE_KEY_MAX_LENGTH } from '../common/validation/rules.js';

// The one place object keys are built and checked (spec 0011 M7). The first segment of a key is its
// class: who may read it and how long it lives. The server names every private key; a key sent by
// a client is only ever checked against these (isInUserFolder), never trusted.

// The catalog media: readable from the server (M15), no expiry. The database keeps the key without
// this prefix (`seed/products/<article>/<n>.webp`); nginx and the seed add it.
const MEDIA_CLASS = 'media';
// Stored on each media object and passed through by nginx (spec 0002 C9e).
export const MEDIA_CACHE_CONTROL = 'public, max-age=86400';

// Classes that hold users' files, each `<class>/users/<userId>/…`. A later retention period is one
// more class here and one more lifecycle rule; deleting a user's files clears every class (M7).
export const RETENTION_CLASSES = ['keep'] as const;
// No expiry (M4): the fitting photo and the generations' input and result.
const KEEP_CLASS: (typeof RETENTION_CLASSES)[number] = 'keep';

// One segment, as IMAGE_KEY allows it (spec 0002 C22): an id goes into a key only this way, so it
// cannot add a `/` or a `..`.
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function segment(value: string, name: string): string {
  if (!isSegment(value)) {
    throw new Error(`${name} is not a valid key segment`);
  }
  return value;
}

function checked(key: string): string {
  if (!isValidKey(key)) {
    throw new Error('Not a valid object key');
  }
  return key;
}

// A whole key: the rule of the database's image columns (spec 0002 C22).
export function isValidKey(key: string): boolean {
  return key.length <= IMAGE_KEY_MAX_LENGTH && IMAGE_KEY.test(key);
}

function isSegment(value: string): boolean {
  return SEGMENT.test(value) && !value.includes('..');
}

// The only prefixes deletePrefix takes: one user's folder in a retention class
// (`<class>/users/<userId>/`, userFolders) or one generation's folder (generationFolder). A class,
// `media/` or any other prefix is refused, so one call never clears more than one user's files.
export function isDeletableFolder(prefix: string): boolean {
  if (!prefix.endsWith('/') || !isValidKey(prefix.slice(0, -1))) {
    return false;
  }
  const [retentionClass, users, userId, generations, generationId, ...rest] = prefix
    .slice(0, -1)
    .split('/');
  if (
    !RETENTION_CLASSES.some((name) => name === retentionClass) ||
    users !== 'users' ||
    userId === undefined ||
    !isSegment(userId)
  ) {
    return false;
  }
  if (generations === undefined) {
    return true;
  }
  return (
    retentionClass === KEEP_CLASS &&
    generations === 'generations' &&
    generationId !== undefined &&
    isSegment(generationId) &&
    rest.length === 0
  );
}

// The bucket key of a catalog image whose database key is `key`.
export function mediaKey(key: string): string {
  checked(key);
  return checked(`${MEDIA_CLASS}/${key}`);
}

function userFolder(retentionClass: string, userId: string): string {
  return `${retentionClass}/users/${segment(userId, 'userId')}/`;
}

// A new key for the photo a user uploads to try clothes on (`users.fitting_profile_image_key`).
export function userPhotoKey(userId: string): string {
  return checked(`${userFolder(KEEP_CLASS, userId)}photos/${randomUUID()}.webp`);
}

// The folder of one generation: its input snapshot (spec 0002 C14) and its result.
export function generationFolder(userId: string, generationId: string): string {
  return `${userFolder(KEEP_CLASS, userId)}generations/${segment(generationId, 'generationId')}/`;
}

export function generationInputKey(userId: string, generationId: string): string {
  return checked(`${generationFolder(userId, generationId)}input.webp`);
}

export function generationResultKey(userId: string, generationId: string): string {
  return checked(`${generationFolder(userId, generationId)}result.webp`);
}

// Every folder of a user's files, one per retention class: what deleting a user clears.
export function userFolders(userId: string): string[] {
  return RETENTION_CLASSES.map((retentionClass) => userFolder(retentionClass, userId));
}

// Whether `key` is a file inside one of the user's folders. False for media/ and tmp/ keys, for
// another user's key and for anything that is not a valid key or id. The id is compared as it is:
// pass the one the database holds (lower case), not one from a request path.
export function isInUserFolder(key: string, userId: string): boolean {
  if (!isValidKey(key) || !isSegment(userId)) {
    return false;
  }
  return userFolders(userId).some((folder) => key.startsWith(folder));
}

// Whether `key` lies in a class that holds users' files, whoever the user.
export function isUserFileKey(key: string): boolean {
  return RETENTION_CLASSES.some((retentionClass) => key.startsWith(`${retentionClass}/`));
}
