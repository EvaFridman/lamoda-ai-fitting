import { Readable, Transform } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Encrypter } from 'age-encryption';
import type { Logger } from 'pino';
import { pack, type Pack } from 'tar-stream';

import { StorageError } from '../storage/storage.error.js';
import { PART_SIZE } from './database.js';
import { loggedKey } from './keys.js';

// The key classes that are copied; `tmp/` expires in a day and is never listed (P9, AC5).
export const COPIED_PREFIXES = ['media/', 'keep/'] as const;

export interface BucketCopyOptions {
  // The age public key every copy is encrypted to (P5).
  recipient: string;
  // The read-only client of the app bucket (P9).
  source: S3Client;
  sourceBucket: string;
  // The write-only client of the backup bucket, and the copy's key there (keys.ts).
  target: S3Client;
  targetBucket: string;
  key: string;
  logger: Logger;
  // Keys per listing page; S3's own 1000 by default, fewer in the tests.
  pageSize?: number;
}

export interface BucketCopy {
  key: string;
  // Copied objects and their bytes as read.
  objects: number;
  objectBytes: number;
  // Deleted between the listing and the read.
  skipped: number;
  // Of the encrypted copy as stored.
  bytes: number;
}

interface Counts {
  objects: number;
  objectBytes: number;
  skipped: number;
}

// Copies `media/` and `keep/` of the app bucket into the backup bucket as one age-encrypted tar
// (plan §3): each object is an entry named by its full key, read one after another, so memory
// holds one upload part whatever the bucket's size. Nothing touches the disk (P13). A failed run
// destroys the archive, so the upload aborts its multipart upload or never sends its single
// PutObject (plan §2), and waits for that before it throws. Throws StorageError, which carries no
// key.
export async function copyBucket(options: BucketCopyOptions): Promise<BucketCopy> {
  const encrypter = new Encrypter();
  encrypter.addRecipient(options.recipient);
  const archive = pack();
  const encrypted = Readable.fromWeb(
    (await encrypter.encrypt(
      Readable.toWeb(
        Readable.from(archive, { objectMode: false }),
      ) as globalThis.ReadableStream<Uint8Array>,
    )) as ReadableStream<Uint8Array>,
  );
  let bytes = 0;
  const body = encrypted.pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(null, chunk);
      },
    }),
  );
  // pipe() does not pass errors on; the upload reads the body.
  encrypted.on('error', (error) => body.destroy(error));

  const counts: Counts = { objects: 0, objectBytes: 0, skipped: 0 };
  const stop = new AbortController();
  // A failed read rejects with its StorageError; a read stopped by a failed upload, with the stop's
  // reason (decided when it fails, so the order the two failures arrive in does not matter).
  const filled = fill(archive, options, counts, stop.signal);
  filled.catch((error: unknown) => {
    archive.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  const uploaded = new Upload({
    client: options.target,
    params: { Bucket: options.targetBucket, Key: options.key, Body: body },
    partSize: PART_SIZE,
    queueSize: 1,
  }).done();

  try {
    await Promise.all([filled, uploaded]);
  } catch (error) {
    stop.abort();
    archive.destroy();
    encrypted.destroy();
    body.destroy();
    // The upload sends its abort before it settles; returning earlier would leave it running.
    const [read] = await Promise.allSettled([filled, uploaded]);
    if (read.status === 'rejected' && read.reason !== stop.signal.reason) throw read.reason;
    throw StorageError.from('upload', error);
  }
  const copy = { key: options.key, ...counts, bytes };
  options.logger.info({ ...copy, key: loggedKey(copy.key) }, 'Bucket copy stored');
  return copy;
}

async function fill(
  archive: Pack,
  options: BucketCopyOptions,
  counts: Counts,
  signal: AbortSignal,
): Promise<void> {
  for (const prefix of COPIED_PREFIXES) {
    let token: string | undefined;
    do {
      const page = await options.source
        .send(
          new ListObjectsV2Command({
            Bucket: options.sourceBucket,
            Prefix: prefix,
            ContinuationToken: token,
            MaxKeys: options.pageSize,
          }),
          { abortSignal: signal },
        )
        .catch((error: unknown) => {
          signal.throwIfAborted();
          throw StorageError.from('ListObjectsV2', error);
        });
      for (const { Key: key } of page.Contents ?? []) {
        if (key !== undefined) await addObject(archive, options, key, counts, signal);
      }
      if (page.IsTruncated === true && page.NextContinuationToken === undefined) {
        // Stopping here would store a partial copy and report success.
        throw new StorageError('ListObjectsV2', 'NoContinuationToken', undefined, undefined);
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
  }
  archive.finalize();
}

async function addObject(
  archive: Pack,
  options: BucketCopyOptions,
  key: string,
  counts: Counts,
  signal: AbortSignal,
): Promise<void> {
  let object;
  try {
    object = await options.source.send(
      new GetObjectCommand({ Bucket: options.sourceBucket, Key: key }),
      { abortSignal: signal },
    );
  } catch (error) {
    signal.throwIfAborted();
    // Deleted since the listing (plan §3): a row and a file may disagree anyway (spec,
    // Assumptions).
    if ((error as Error).name === 'NoSuchKey') {
      counts.skipped += 1;
      return;
    }
    throw StorageError.from('GetObject', error);
  }
  const source = object.Body as Readable;
  const size = object.ContentLength ?? 0;
  const stopRead = () => source.destroy(new Error('Bucket copy stopped'));
  signal.addEventListener('abort', stopRead, { once: true });
  let read = false;
  try {
    // Stopped while GetObject was answering: the listener above came too late.
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      // The callback comes once the entry is written, or with its error.
      const entry = archive.entry(
        { name: key, size, mtime: object.LastModified ?? new Date(0) },
        (error) => {
          if (!error) resolve();
          else reject(signal.aborted ? signal.reason : entryError(error));
        },
      );
      // The entry's error (the source's, or a size mismatch) reaches the callback above and also
      // destroys the archive with it; a listener of our own keeps it from being thrown as well.
      entry.on('error', () => undefined);
      // pipe() does not pass a source's error on.
      source.on('error', (error) => entry.destroy(error));
      source.pipe(entry);
    });
    read = true;
  } finally {
    signal.removeEventListener('abort', stopRead);
    // A failed entry only unpipes the body, whose socket would stay open until its timeout.
    if (!read) source.destroy();
  }
  counts.objects += 1;
  counts.objectBytes += size;
}

// tar-stream refuses a body shorter or longer than the entry's size (its ContentLength) with a
// plain `Size mismatch`; any other error is the body's own.
function entryError(error: Error): StorageError {
  return error.message === 'Size mismatch'
    ? new StorageError('GetObject', 'BodyLengthMismatch', undefined, undefined)
    : StorageError.from('GetObject', error);
}
