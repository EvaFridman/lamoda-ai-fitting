import { randomUUID } from 'node:crypto';

import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userPhotoKey } from './keys.js';
import {
  S3_CLIENT,
  S3_SIGNING_CLIENT,
  STORAGE_SETTINGS,
  type StorageSettings,
} from './s3-client.provider.js';
import { StorageError } from './storage.error.js';
import { StorageService } from './storage.service.js';

const SETTINGS: StorageSettings = {
  endpoint: 'http://s3.test:1',
  publicEndpoint: 'http://s3.test:1',
  region: 'ru-1',
  bucket: 'bucket',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  signedUrlTtlSeconds: 900,
};

const USER = randomUUID();
const OTHER = randomUUID();

function s3Error(status: number): S3ServiceException {
  return new S3ServiceException({
    name: 'Error',
    $fault: 'client',
    $metadata: { httpStatusCode: status },
    message: 'failed',
  });
}

describe('StorageService', () => {
  const send = vi.fn();
  let service: StorageService;

  beforeEach(async () => {
    send.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: STORAGE_SETTINGS, useValue: SETTINGS },
        { provide: S3_CLIENT, useValue: { send, destroy: vi.fn() } as unknown as S3Client },
        { provide: S3_SIGNING_CLIENT, useValue: { send, destroy: vi.fn() } as unknown as S3Client },
      ],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  describe('refusals before any request', () => {
    it.each(['../x', 'a//b', '', '/a'])('put refuses the key %j', async (key) => {
      await expect(
        service.put(key, new Uint8Array(), { contentType: 'image/webp' }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('exists refuses an invalid key', async () => {
      await expect(service.exists('../x')).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('signedUrl refuses an invalid key', async () => {
      await expect(service.signedUrl('a//b')).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it.each(['text/html', 'image/svg+xml', 'image/png', ''])(
      'put refuses the content type %j',
      async (contentType) => {
        await expect(
          service.put('media/seed/a.webp', new Uint8Array(), { contentType }),
        ).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
      },
    );

    it.each(['', 'keep', 'keep/', 'media/', 'keep/users/', 'keep/users/x', '../', '/'])(
      'deletePrefix refuses %j',
      async (prefix) => {
        await expect(service.deletePrefix(prefix)).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
      },
    );

    it('put refuses a keep key without an owner', async () => {
      await expect(
        service.put(userPhotoKey(USER), new Uint8Array(), { contentType: 'image/webp' }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it("put refuses a key outside the owner's folder", async () => {
      await expect(
        service.put(userPhotoKey(OTHER), new Uint8Array(), {
          contentType: 'image/webp',
          ownerUserId: USER,
        }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('put refuses a media key with an owner', async () => {
      await expect(
        service.put('media/seed/a.webp', new Uint8Array(), {
          contentType: 'image/webp',
          ownerUserId: USER,
        }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('put', () => {
    it("sends the owner's id as metadata with the type and cache control", async () => {
      send.mockResolvedValue({});
      const key = userPhotoKey(USER);
      const body = new Uint8Array([1, 2]);
      await service.put(key, body, {
        contentType: 'image/webp',
        cacheControl: 'private',
        ownerUserId: USER,
      });
      const command = send.mock.calls[0]?.[0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'bucket',
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'private',
        Metadata: { 'owner-user-id': USER },
      });
    });

    it('sends no metadata without an owner', async () => {
      send.mockResolvedValue({});
      await service.put('media/seed/a.webp', new Uint8Array(), {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=86400',
      });
      const command = send.mock.calls[0]?.[0] as PutObjectCommand;
      expect(command.input.Metadata).toBeUndefined();
      expect(command.input.CacheControl).toBe('public, max-age=86400');
      expect(command.input.ContentType).toBe('image/webp');
    });
  });

  describe('exists', () => {
    it('is true when the object answers', async () => {
      send.mockResolvedValue({});
      await expect(service.exists('media/a.webp')).resolves.toBe(true);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    });

    it('is false on a 404', async () => {
      send.mockRejectedValue(s3Error(404));
      await expect(service.exists('media/a.webp')).resolves.toBe(false);
    });

    it('fails with a StorageError on a 403', async () => {
      send.mockRejectedValue(s3Error(403));
      const promise = service.exists('media/a.webp');
      await expect(promise).rejects.toBeInstanceOf(StorageError);
      await expect(promise).rejects.toMatchObject({
        operation: 'HeadObject',
        code: 'Error',
        status: 403,
      });
    });

    it('fails with a StorageError on an error that is not from S3', async () => {
      send.mockRejectedValue(
        Object.assign(new Error('keep/users/u1 network'), { name: 'ECONNRESET' }),
      );
      const promise = service.exists('media/a.webp');
      await expect(promise).rejects.toBeInstanceOf(StorageError);
      await expect(promise).rejects.toMatchObject({
        operation: 'HeadObject',
        code: 'ECONNRESET',
        status: undefined,
      });
      await expect(promise).rejects.toHaveProperty(
        'message',
        'Storage HeadObject failed: ECONNRESET',
      );
    });
  });

  describe('storage failures', () => {
    it('put fails with a StorageError', async () => {
      send.mockRejectedValue(s3Error(500));
      const promise = service.put('media/a.webp', new Uint8Array(), { contentType: 'image/webp' });
      await expect(promise).rejects.toBeInstanceOf(StorageError);
      await expect(promise).rejects.toMatchObject({
        operation: 'PutObject',
        code: 'Error',
        status: 500,
      });
    });

    it('a failed list fails deletePrefix with a StorageError', async () => {
      send.mockRejectedValue(s3Error(403));
      const promise = service.deletePrefix(`keep/users/${USER}/`);
      await expect(promise).rejects.toBeInstanceOf(StorageError);
      await expect(promise).rejects.toMatchObject({
        operation: 'ListObjectsV2',
        status: 403,
      });
    });

    it('a failed delete fails deletePrefix with a StorageError', async () => {
      send.mockImplementation((command: unknown) =>
        command instanceof ListObjectsV2Command
          ? Promise.resolve({ Contents: [{ Key: 'a' }], IsTruncated: false })
          : Promise.reject(s3Error(500)),
      );
      const promise = service.deletePrefix(`keep/users/${USER}/`);
      await expect(promise).rejects.toBeInstanceOf(StorageError);
      await expect(promise).rejects.toMatchObject({ operation: 'DeleteObjects', status: 500 });
    });
  });

  describe('deletePrefix', () => {
    const folder = `keep/users/${USER}/`;

    it('follows continuation tokens and counts every deleted key', async () => {
      send.mockImplementation((command: unknown) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve(
            command.input.ContinuationToken === undefined
              ? {
                  Contents: [{ Key: 'a' }, { Key: 'b' }],
                  IsTruncated: true,
                  NextContinuationToken: 't1',
                }
              : { Contents: [{ Key: 'c' }], IsTruncated: false },
          );
        }
        return Promise.resolve({});
      });
      await expect(service.deletePrefix(folder)).resolves.toBe(3);
      const lists = send.mock.calls
        .map(([c]) => c)
        .filter((c) => c instanceof ListObjectsV2Command);
      expect(lists.map((c: ListObjectsV2Command) => c.input.ContinuationToken)).toEqual([
        undefined,
        't1',
      ]);
      const deletes = send.mock.calls
        .map(([c]) => c)
        .filter((c): c is DeleteObjectsCommand => c instanceof DeleteObjectsCommand);
      expect(deletes.map((c) => c.input.Delete?.Objects)).toEqual([
        [{ Key: 'a' }, { Key: 'b' }],
        [{ Key: 'c' }],
      ]);
    });

    it('throws on a truncated page without a continuation token, after deleting its keys', async () => {
      send.mockImplementation((command: unknown) =>
        Promise.resolve(
          command instanceof ListObjectsV2Command
            ? { Contents: [{ Key: 'a' }], IsTruncated: true }
            : {},
        ),
      );
      await expect(service.deletePrefix(folder)).rejects.toThrow();
      expect(send.mock.calls.some(([c]) => c instanceof DeleteObjectsCommand)).toBe(true);
    });

    it('returns 0 and deletes nothing for an empty folder', async () => {
      send.mockResolvedValue({ Contents: undefined, IsTruncated: false });
      await expect(service.deletePrefix(folder)).resolves.toBe(0);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('reports a Code that is not name-like as unknown', async () => {
      send.mockImplementation((command: unknown) =>
        Promise.resolve(
          command instanceof ListObjectsV2Command
            ? { Contents: [{ Key: 'a' }], IsTruncated: false }
            : { Errors: [{ Key: 'a', Code: 'keep/users/u1 denied' }] },
        ),
      );
      const error = await service.deletePrefix(folder).then(
        () => undefined,
        (e: unknown) => e as Error,
      );
      expect(error?.message).toContain('unknown');
      expect(error?.message).not.toContain('keep/users');
    });

    it('throws when some objects are not deleted, without the keys in the message', async () => {
      const secretKey = `keep/users/${USER}/photos/x.webp`;
      send.mockImplementation((command: unknown) =>
        Promise.resolve(
          command instanceof ListObjectsV2Command
            ? { Contents: [{ Key: secretKey }], IsTruncated: false }
            : { Errors: [{ Key: secretKey, Code: 'AccessDenied' }] },
        ),
      );
      const error = await service.deletePrefix(folder).then(
        () => undefined,
        (e: unknown) => e as Error,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain('AccessDenied');
      expect(error?.message).not.toContain(USER);
      expect(error?.message).not.toContain('x.webp');
    });
  });
});
