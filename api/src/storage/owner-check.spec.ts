import type { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { userPhotoKey } from './keys.js';
import { noKeyDetails, ownedLink, ownerFolderDetails } from './owner-check.js';
import type { StorageService } from './storage.service.js';

const OWNER = '3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('ownerFolderDetails', () => {
  it('passes a key in the owner folder', () => {
    expect(ownerFolderDetails({ fittingProfileImageKey: userPhotoKey(OWNER) }, OWNER)).toEqual([]);
  });

  it('passes null and undefined, which write no file', () => {
    expect(ownerFolderDetails({ a: null, b: undefined }, OWNER)).toEqual([]);
  });

  it('passes an empty list of keys', () => {
    expect(ownerFolderDetails({}, OWNER)).toEqual([]);
  });

  it.each([
    ['another user', userPhotoKey(OTHER)],
    ['media', 'media/seed/products/a/1.webp'],
    ['tmp', 'tmp/abc/photo.webp'],
    ['a bare key', 'users/photo.jpg'],
    ['a prefix of the folder without the slash', `keep/users/${OWNER}x/photos/a.webp`],
    ['not a valid key', '../x.webp'],
  ])('refuses %s, naming the field with the code IN_OWNER_FOLDER', (_label, key) => {
    expect(ownerFolderDetails({ userImageKey: key }, OWNER)).toEqual([
      {
        field: 'userImageKey',
        code: 'IN_OWNER_FOLDER',
        message: expect.stringContaining('userImageKey') as unknown,
      },
    ]);
  });

  it('reports every refused field and only those', () => {
    const details = ownerFolderDetails(
      { userImageKey: userPhotoKey(OTHER), resultImageKey: userPhotoKey(OWNER), x: 'bad' },
      OWNER,
    );

    expect(details.map((detail) => detail.field)).toEqual(['userImageKey', 'x']);
  });

  it('compares the owner id as given: an upper-case id owns nothing', () => {
    expect(
      ownerFolderDetails({ key: userPhotoKey(OWNER) }, OWNER.toUpperCase()).map((d) => d.field),
    ).toEqual(['key']);
  });
});

describe('ownedLink', () => {
  function setup() {
    const signedUrl = vi.fn((key: string) => Promise.resolve(`https://s3.test/${key}?sig=1`));
    const warn = vi.fn();
    return {
      signedUrl,
      warn,
      storage: { signedUrl } as unknown as StorageService,
      logger: { warn } as unknown as Logger,
    };
  }

  it('answers null for a null key without signing or warning', async () => {
    const { storage, logger, signedUrl, warn } = setup();

    const link = await ownedLink(storage, logger, {
      rowId: 'row-1',
      field: 'userImageKey',
      key: null,
      ownerId: OWNER,
    });

    expect(link).toBeNull();
    expect(signedUrl).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('signs a key in the owner folder', async () => {
    const { storage, logger, signedUrl, warn } = setup();
    const key = userPhotoKey(OWNER);

    const link = await ownedLink(storage, logger, {
      rowId: 'row-1',
      field: 'fittingProfileImageKey',
      key,
      ownerId: OWNER,
    });

    expect(link).toBe(`https://s3.test/${key}?sig=1`);
    expect(signedUrl).toHaveBeenCalledExactlyOnceWith(key);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['another user', userPhotoKey(OTHER)],
    ['media', 'media/seed/products/a/1.webp'],
    ['tmp', 'tmp/abc/photo.webp'],
    ['a bare key', 'users/photo.jpg'],
  ])('answers null for %s, warns with the row and field and not the key', async (_l, key) => {
    const { storage, logger, signedUrl, warn } = setup();

    const link = await ownedLink(storage, logger, {
      rowId: 'row-42',
      field: 'resultImageKey',
      key,
      ownerId: OWNER,
    });

    expect(link).toBeNull();
    expect(signedUrl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 'row-42', field: 'resultImageKey' }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
  });
});

describe('noKeyDetails', () => {
  it('refuses any string key, even one that looks valid', () => {
    expect(noKeyDetails({ fittingProfileImageKey: userPhotoKey(OWNER) })).toEqual([
      {
        field: 'fittingProfileImageKey',
        code: 'IN_OWNER_FOLDER',
        message: expect.stringContaining('fittingProfileImageKey') as unknown,
      },
    ]);
  });

  it('passes null, undefined and no keys', () => {
    expect(noKeyDetails({ a: null, b: undefined })).toEqual([]);
    expect(noKeyDetails({})).toEqual([]);
  });

  it('reports each key present', () => {
    expect(noKeyDetails({ a: 'x', b: null, c: 'y' }).map((detail) => detail.field)).toEqual([
      'a',
      'c',
    ]);
  });
});
