import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { IMAGE_KEY } from '../common/validation/rules.js';
import {
  generationFolder,
  generationInputKey,
  generationResultKey,
  isDeletableFolder,
  isDeletablePrefix,
  isInUserFolder,
  isUserFileKey,
  isUserPhotoKey,
  isValidKey,
  MEDIA_CACHE_CONTROL,
  mediaKey,
  RETENTION_CLASSES,
  userFolders,
  userPhotoKey,
} from './keys.js';

const USER = randomUUID();
const OTHER = randomUUID();
const GENERATION = randomUUID();

describe('mediaKey', () => {
  it('adds the media prefix', () => {
    expect(mediaKey('seed/products/a1/1.webp')).toBe('media/seed/products/a1/1.webp');
  });

  it.each(['../x', 'a//b', '', '/a', 'a/', 'a b', 'a/../b', 'a'.repeat(256)])(
    'refuses the invalid key %j',
    (key) => {
      expect(() => mediaKey(key)).toThrow();
    },
  );

  it('refuses a key that is valid only without the prefix', () => {
    expect(() => mediaKey('a'.repeat(250))).toThrow();
  });
});

describe('userPhotoKey', () => {
  it('has the shape keep/users/<id>/photos/<uuid>.webp', () => {
    expect(userPhotoKey(USER)).toMatch(
      new RegExp(`^keep/users/${USER}/photos/[0-9a-f-]{36}\\.webp$`),
    );
  });

  it('is different on every call', () => {
    expect(userPhotoKey(USER)).not.toBe(userPhotoKey(USER));
  });

  it.each(['a/b', '..', 'a..b', '', '/x', 'x/'])('refuses the user id %j', (id) => {
    expect(() => userPhotoKey(id)).toThrow();
  });
});

describe('generation keys', () => {
  it('puts a generation in its own folder', () => {
    expect(generationFolder(USER, GENERATION)).toBe(
      `keep/users/${USER}/generations/${GENERATION}/`,
    );
    expect(generationInputKey(USER, GENERATION)).toBe(
      `keep/users/${USER}/generations/${GENERATION}/input.webp`,
    );
    expect(generationResultKey(USER, GENERATION)).toBe(
      `keep/users/${USER}/generations/${GENERATION}/result.webp`,
    );
  });

  it('refuses a generation id with a slash or dots', () => {
    expect(() => generationFolder(USER, 'a/b')).toThrow();
    expect(() => generationInputKey(USER, '..')).toThrow();
    expect(() => generationResultKey('../x', GENERATION)).toThrow();
  });
});

describe('userFolders', () => {
  it('gives one folder per retention class', () => {
    const folders = userFolders(USER);
    expect(folders).toHaveLength(RETENTION_CLASSES.length);
    expect(folders).toEqual(RETENTION_CLASSES.map((c) => `${c}/users/${USER}/`));
  });
});

describe('isInUserFolder', () => {
  it("is true for the user's own keys", () => {
    expect(isInUserFolder(userPhotoKey(USER), USER)).toBe(true);
    expect(isInUserFolder(generationResultKey(USER, GENERATION), USER)).toBe(true);
  });

  it.each([
    ['another user', userPhotoKey(OTHER)],
    ['media', 'media/seed/a.webp'],
    ['tmp', `tmp/users/${USER}/a.webp`],
    ['the folder itself', `keep/users/${USER}/`],
    ['an invalid key', `keep/users/${USER}/../${OTHER}/a.webp`],
    ['an empty key', ''],
  ])('is false for %s', (_name, key) => {
    expect(isInUserFolder(key, USER)).toBe(false);
  });

  it('is false when the user id is a prefix of another id', () => {
    expect(isInUserFolder(`keep/users/${USER}x/photos/a.webp`, USER)).toBe(false);
  });

  it('is false for an invalid user id', () => {
    expect(isInUserFolder(`keep/users/a/b/photos/a.webp`, 'a/b')).toBe(false);
    expect(isInUserFolder(`keep/users/../photos/a.webp`, '..')).toBe(false);
    expect(isInUserFolder('keep/users/a..b/photos/a.webp', 'a..b')).toBe(false);
  });
});

describe('isDeletableFolder', () => {
  it.each([`keep/users/${USER}/`, `keep/users/${USER}/generations/${GENERATION}/`])(
    'accepts %j',
    (prefix) => {
      expect(isDeletableFolder(prefix)).toBe(true);
    },
  );

  it('accepts what userFolders and generationFolder build', () => {
    expect(userFolders(USER).every(isDeletableFolder)).toBe(true);
    expect(isDeletableFolder(generationFolder(USER, GENERATION))).toBe(true);
  });

  it.each([
    '',
    'keep/',
    'keep/users/',
    'media/',
    'media/x/',
    'tmp/x/',
    'a/b/',
    'keep/users/u1',
    'keep/users/u1/photos/',
    'keep/users/u1/generations/',
    'keep/users/u1/generations/g1/x/',
    'keep/users/a..b/',
    'other/users/u1/',
  ])('refuses %j', (prefix) => {
    expect(isDeletableFolder(prefix)).toBe(false);
  });
});

describe('isUserPhotoKey and isDeletablePrefix', () => {
  it('accept what userPhotoKey builds', () => {
    const key = userPhotoKey(USER);
    expect(isUserPhotoKey(key)).toBe(true);
    expect(isDeletablePrefix(key)).toBe(true);
  });

  it('isDeletablePrefix accepts the folders too', () => {
    expect(isDeletablePrefix(`keep/users/${USER}/`)).toBe(true);
    expect(isDeletablePrefix(generationFolder(USER, GENERATION))).toBe(true);
  });

  it.each([
    ['the photos folder', `keep/users/${USER}/photos/`],
    ['a nested file', `keep/users/${USER}/photos/a/b.webp`],
    ['a media key', 'media/seed/products/a1/1.webp'],
    ['a generation key', generationResultKey(USER, GENERATION)],
    ['an invalid user segment', 'keep/users/a..b/photos/x.webp'],
    ['an invalid file segment', `keep/users/${USER}/photos/..`],
    ['a name that is not a uuid', `keep/users/${USER}/photos/a.webp`],
    ['a uuid with another extension', `keep/users/${USER}/photos/${GENERATION}.png`],
    ['an upper-case uuid', `keep/users/${USER}/photos/${GENERATION.toUpperCase()}.webp`],
    ['a uuid without an extension', `keep/users/${USER}/photos/${GENERATION}`],
    ['another class', `tmp/users/${USER}/photos/x.webp`],
    ['an empty key', ''],
  ])('refuse %s', (_name, key) => {
    expect(isUserPhotoKey(key)).toBe(false);
    expect(isDeletablePrefix(key)).toBe(false);
  });
});

describe('isUserFileKey', () => {
  it('is true for keep keys and false for the others', () => {
    expect(isUserFileKey(userPhotoKey(USER))).toBe(true);
    expect(isUserFileKey('media/a.webp')).toBe(false);
    expect(isUserFileKey('tmp/a.webp')).toBe(false);
    expect(isUserFileKey('keeper/a.webp')).toBe(false);
  });
});

describe('MEDIA_CACHE_CONTROL', () => {
  it('is one day, public', () => {
    expect(MEDIA_CACHE_CONTROL).toBe('public, max-age=86400');
  });
});

describe('built keys', () => {
  it('all pass the image key rule', () => {
    const keys = [
      mediaKey('seed/a/1.webp'),
      userPhotoKey(USER),
      generationInputKey(USER, GENERATION),
      generationResultKey(USER, GENERATION),
    ];
    for (const key of keys) {
      expect(IMAGE_KEY.test(key)).toBe(true);
      expect(isValidKey(key)).toBe(true);
    }
  });
});
