import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import pino from 'pino';
import { extract } from 'tar-stream';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { copyBucket } from '../../src/backup/bucket.js';
import { copyDatabase, DatabaseCopyError, PART_SIZE } from '../../src/backup/database.js';
import { postgresEnv } from '../../src/backup/config.js';
import { dailyDatabaseKey, dailyStorageKey } from '../../src/backup/keys.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { SeedService } from '../../src/seed/seed.service.js';
import { createS3Client } from '../../src/storage/s3-client.provider.js';
import { StorageError } from '../../src/storage/storage.error.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestDatabaseUrl } from '../support/test-database.js';
import { createTestS3Client, testStorageSettings } from '../support/test-storage.js';

const BACKUP_BUCKET = 'ai-fitting-test-backups';
const PG_ENV_NAMES = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];

let client: S3Client;
let identity: string;
let recipient: string;
let sourceUrl: string;
let sourcePrisma: PrismaClient;
let containerId: string;
let toolPrefix: string[];

// The address of a test database from inside the PostgreSQL container.
function insideContainer(url: string): string {
  const inside = new URL(url);
  inside.hostname = 'localhost';
  inside.port = '5432';
  return inside.toString();
}

function prismaOf(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

function dockerExec(id: string): string[] {
  return ['docker', 'exec', '-i', ...PG_ENV_NAMES.flatMap((name) => ['-e', name]), id];
}

function lines(): { destination: Writable; output: string[] } {
  const output: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output.push(chunk.toString());
      callback();
    },
  });
  return { destination, output };
}

function uniqueKey(): string {
  return dailyDatabaseKey(new Date(Date.now() + Math.floor(Math.random() * 1e9) * 1000));
}

function quietLogger() {
  return pino({ level: 'silent' });
}

async function status(key: string, s3: S3Client = client): Promise<number> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }));
    return 200;
  } catch (error) {
    return (error as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode;
  }
}

async function restore(plain: Uint8Array, databaseUrl: string): Promise<void> {
  const child = spawn(
    dockerExec(containerId)[0] as string,
    [
      ...dockerExec(containerId).slice(1),
      'pg_restore',
      '--no-owner',
      '--exit-on-error',
      `--dbname=${postgresEnv(databaseUrl).PGDATABASE}`,
    ],
    { env: { ...process.env, ...postgresEnv(databaseUrl) }, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  child.stdin.end(plain);
  const code = await closed;
  if (code !== 0) throw new Error(`pg_restore exited with ${code}: ${stderr}`);
}

async function counts(prisma: PrismaClient): Promise<Record<string, number>> {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const result: Record<string, number> = {};
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${tablename}"`,
    );
    result[tablename] = rows[0]?.n ?? -1;
  }
  return result;
}

function everything(error: unknown): string {
  const own =
    error instanceof Error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : '';
  return `${String(error)}${own}${JSON.stringify(error)}`;
}

beforeAll(async () => {
  client = createTestS3Client();
  try {
    await client.send(new CreateBucketCommand({ Bucket: BACKUP_BUCKET }));
  } catch (error) {
    const name = (error as Error).name;
    if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
  }

  identity = await generateIdentity();
  recipient = await identityToRecipient(identity);
  containerId = inject('postgresContainerId');
  toolPrefix = dockerExec(containerId);

  sourceUrl = await createTestDatabaseUrl();
  sourcePrisma = prismaOf(sourceUrl);
  const storage = { exists: async () => true, put: vi.fn() } as unknown as StorageService;
  await new SeedService(sourcePrisma, storage).run();
}, 120_000);

afterAll(async () => {
  await sourcePrisma.$disconnect();
  client.destroy();
  for (const extra of extraClients) extra.destroy();
});

function options(overrides: Partial<Parameters<typeof copyDatabase>[0]> = {}) {
  return {
    databaseUrl: insideContainer(sourceUrl),
    recipient,
    client,
    bucket: BACKUP_BUCKET,
    key: uniqueKey(),
    logger: quietLogger(),
    toolPrefix,
    toolEnv: process.env,
    ...overrides,
  };
}

describe('copyDatabase', () => {
  it('stores an age-encrypted dump that restores to the same rows', async () => {
    const copyOptions = options();
    const copy = await copyDatabase(copyOptions);

    const head = await client.send(
      new HeadObjectCommand({ Bucket: BACKUP_BUCKET, Key: copyOptions.key }),
    );
    expect(copy.key).toBe(copyOptions.key);
    expect(copy.bytes).toBe(head.ContentLength);

    const object = await client.send(
      new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: copyOptions.key }),
    );
    const encrypted = await object.Body?.transformToByteArray();
    if (encrypted === undefined) throw new Error('no body');
    expect(Buffer.from(encrypted.subarray(0, 21)).toString()).toBe('age-encryption.org/v1');

    const decrypter = new Decrypter();
    decrypter.addIdentity(identity);
    const plain = await decrypter.decrypt(encrypted);
    expect(Buffer.from(plain.subarray(0, 5)).toString()).toBe('PGDMP');

    const restoredUrl = new URL(await createEmptyDatabase());
    const restoredPrisma = prismaOf(restoredUrl.toString());
    try {
      await restore(plain, insideContainer(restoredUrl.toString()));
      const original = await counts(sourcePrisma);
      expect(Object.keys(original)).toContain('_prisma_migrations');
      expect(Object.values(original).some((n) => n > 0)).toBe(true);
      expect(await counts(restoredPrisma)).toEqual(original);
    } finally {
      await restoredPrisma.$disconnect();
    }
  }, 120_000);

  it('stores nothing when the check fails', async () => {
    const script =
      'if [ "$0" = pg_restore ]; then cat >/dev/null; sleep 1; exit 1; fi; exec ' +
      `${dockerExec(containerId).join(' ')} "$0" "$@"`;
    const copyOptions = options({ toolPrefix: ['sh', '-c', script] });

    const error = await copyDatabase(copyOptions).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DatabaseCopyError);
    expect((error as Error).message).toContain('pg_restore');
    expect(await status(copyOptions.key)).toBe(404);
  }, 120_000);

  it('stores nothing when pg_dump fails', async () => {
    const missing = new URL(insideContainer(sourceUrl));
    missing.pathname = '/no_such_database';
    const copyOptions = options({ databaseUrl: missing.toString() });

    const error = await copyDatabase(copyOptions).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DatabaseCopyError);
    expect(await status(copyOptions.key)).toBe(404);
  }, 120_000);

  it('puts no credential in a log line or an error', async () => {
    const settings = testStorageSettings();
    const password = decodeURIComponent(new URL(sourceUrl).password);
    const forbidden = [settings.accessKeyId, settings.secretAccessKey, password];
    expect(password).not.toBe('');

    const captured = lines();
    const logger = pino({ level: 'trace' }, captured.destination);
    await copyDatabase(options({ logger }));

    const wrong = createS3Client(
      { ...settings, secretAccessKey: 'wrongwrongwrongwrong' },
      settings.endpoint,
    );
    const thrown: unknown = await copyDatabase(options({ logger, client: wrong })).catch(
      (caught: unknown) => caught,
    );
    wrong.destroy();

    expect(thrown).toBeInstanceOf(StorageError);
    const text = [...captured.output, everything(thrown)].join('\n');
    expect(captured.output.length).toBeGreaterThan(0);
    for (const secret of [...forbidden, 'wrongwrongwrongwrong']) {
      expect(text).not.toContain(secret);
    }
  }, 120_000);

  it('leaves no unfinished multipart upload when a copy over one part fails its check', async () => {
    const bigUrl = await createTestDatabaseUrl();
    const bigPrisma = prismaOf(bigUrl);
    try {
      // Random bytes: the dump's compression cannot shrink them below one part.
      await bigPrisma.$executeRawUnsafe('CREATE TABLE blob (id int PRIMARY KEY, data bytea)');
      await bigPrisma.$executeRawUnsafe(
        `INSERT INTO blob SELECT g, decode((SELECT string_agg(md5(random()::text || g::text || i::text), '')
           FROM generate_series(1, 30000) i), 'hex') FROM generate_series(1, 30) g`,
      );
    } finally {
      await bigPrisma.$disconnect();
    }
    // Reads the whole dump first, so the upload is past its first part when the check fails.
    const script =
      'if [ "$0" = pg_restore ]; then cat >/dev/null; exit 1; fi; exec ' +
      `${dockerExec(containerId).join(' ')} "$0" "$@"`;
    const target = intercepting();
    const copyOptions = options({
      databaseUrl: insideContainer(bigUrl),
      toolPrefix: ['sh', '-c', script],
      client: target.client,
    });

    const error = await copyDatabase(copyOptions).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DatabaseCopyError);
    expect((error as Error).message).toContain('pg_restore');
    // Without this the test would prove nothing: a single PutObject is never sent either way.
    expect(target.multipartStarted()).toBeGreaterThan(0);
    expect(await status(copyOptions.key)).toBe(404);
    expect(await unfinishedUploads(copyOptions.key)).toBe(0);
  }, 180_000);
});

describe('copyBucket', () => {
  it('lists unfinished multipart uploads (what the tests below rely on)', async () => {
    const key = uniqueStorageKey();
    const created = await client.send(
      new CreateMultipartUploadCommand({ Bucket: BACKUP_BUCKET, Key: key }),
    );
    try {
      expect(await unfinishedUploads(key)).toBe(1);
    } finally {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: BACKUP_BUCKET,
          Key: key,
          UploadId: created.UploadId,
        }),
      );
    }
    expect(await unfinishedUploads(key)).toBe(0);
  });

  it('stores media/ and keep/ whole across listing pages and never tmp/', async () => {
    const bucket = await freshSourceBucket();
    const owner = randomUUID();
    const objects: Record<string, Buffer> = {
      'media/a.jpg': randomBytes(3000),
      'media/b.jpg': randomBytes(1),
      'media/empty.bin': Buffer.alloc(0),
      'media/nested/c.png': randomBytes(1024),
      'media/nested/d.png': randomBytes(513),
      [`keep/users/${owner}/photo.jpg`]: randomBytes(5000),
      [`keep/users/${owner}/gen/1.png`]: randomBytes(512),
      [`keep/users/${randomUUID()}/x.png`]: randomBytes(70_000),
      'keep/other.txt': Buffer.from('plain text'),
    };
    for (const [key, body] of Object.entries(objects)) await put(bucket, key, body);
    await put(bucket, 'tmp/draft-1.jpg', randomBytes(100));
    await put(bucket, `tmp/${owner}/draft-2.jpg`, randomBytes(100));

    const key = uniqueStorageKey();
    const copy = await copyBucket({ ...bucketOptions(bucket, key), pageSize: 2 });

    const head = await client.send(new HeadObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }));
    const sizes = Object.values(objects).map((body) => body.length);
    expect(copy).toEqual({
      key,
      objects: Object.keys(objects).length,
      objectBytes: sizes.reduce((sum, size) => sum + size, 0),
      skipped: 0,
      bytes: head.ContentLength,
    });
    const restored = await restoredEntries(key);
    expect(Object.keys(restored).sort()).toEqual(Object.keys(objects).sort());
    for (const [name, body] of Object.entries(objects)) {
      expect(restored[name]?.equals(body), name).toBe(true);
    }
  }, 120_000);

  it('skips an object deleted after the listing and counts it', async () => {
    const bucket = await freshSourceBucket();
    await put(bucket, 'media/stays-1.jpg', Buffer.from('one'));
    await put(bucket, 'media/vanishing.jpg', Buffer.from('gone'));
    await put(bucket, 'keep/users/u/stays-2.jpg', Buffer.from('two'));
    let deleted = false;
    const source = intercepting({
      after: async (command) => {
        if (command instanceof ListObjectsV2Command && !deleted) {
          deleted = true;
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: 'media/vanishing.jpg' }),
          );
        }
      },
    });
    const key = uniqueStorageKey();

    const copy = await copyBucket({ ...bucketOptions(bucket, key), source: source.client });

    expect(copy).toMatchObject({ objects: 2, objectBytes: 6, skipped: 1 });
    const restored = await restoredEntries(key);
    expect(Object.keys(restored).sort()).toEqual(['keep/users/u/stays-2.jpg', 'media/stays-1.jpg']);
  }, 120_000);

  it('keeps keys longer than 100 characters, with spaces and non-ASCII, intact', async () => {
    const bucket = await freshSourceBucket();
    const names = [
      `keep/users/${randomUUID()}/${'long-name-'.repeat(15)}.jpg`,
      'media/Платье лето 2026 (синее).jpg',
      `media/${'я'.repeat(80)}.png`,
    ];
    const bodies = names.map(() => randomBytes(300));
    for (const [index, name] of names.entries()) await put(bucket, name, bodies[index] as Buffer);
    expect(names[0]?.length).toBeGreaterThan(100);
    const key = uniqueStorageKey();

    await copyBucket(bucketOptions(bucket, key));

    const restored = await restoredEntries(key);
    expect(Object.keys(restored).sort()).toEqual([...names].sort());
    for (const [index, name] of names.entries()) {
      expect(restored[name]?.equals(bodies[index] as Buffer), name).toBe(true);
    }
  }, 120_000);

  it('stores an empty archive for a bucket with nothing to copy', async () => {
    const bucket = await freshSourceBucket();
    await put(bucket, 'tmp/only.jpg', Buffer.from('x'));
    const key = uniqueStorageKey();

    const copy = await copyBucket(bucketOptions(bucket, key));

    expect(copy).toMatchObject({ objects: 0, objectBytes: 0, skipped: 0 });
    expect(await restoredEntries(key)).toEqual({});
  }, 120_000);

  it('leaves no unfinished multipart upload when reading fails after one part was sent', async () => {
    const bucket = await freshSourceBucket();
    const owner = randomUUID();
    const failing = `keep/users/${owner}/second.jpg`;
    await put(
      bucket,
      `keep/users/${owner}/first.jpg`,
      Buffer.alloc(PART_SIZE + 2 * 1024 * 1024, 7),
    );
    await put(bucket, failing, Buffer.from('never read'));
    const target = intercepting();
    const source = intercepting({
      before: async (command) => {
        if (command instanceof GetObjectCommand && command.input.Key === failing) {
          // The first object has to be on its way to the backup bucket before the read fails.
          await vi.waitFor(() => expect(target.multipartStarted()).toBeGreaterThan(0), {
            timeout: 30_000,
          });
          throw Object.assign(new Error(`cannot read ${failing}`), {
            name: 'InternalError',
            $metadata: { httpStatusCode: 500 },
          });
        }
      },
    });
    const key = uniqueStorageKey();

    const error = await copyBucket({
      ...bucketOptions(bucket, key),
      source: source.client,
      target: target.client,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'GetObject', code: 'InternalError', status: 500 });
    expect(everything(error)).not.toContain(owner);
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it('fails, stores nothing and leaves no upload when a body breaks midway', async () => {
    const bucket = await freshSourceBucket();
    const owner = randomUUID();
    const failing = `keep/users/${owner}/second.jpg`;
    await put(
      bucket,
      `keep/users/${owner}/first.jpg`,
      Buffer.alloc(PART_SIZE + 2 * 1024 * 1024, 7),
    );
    await put(bucket, failing, randomBytes(1000));
    const target = intercepting();
    const source = intercepting({
      before: async (command) => {
        if (command instanceof GetObjectCommand && command.input.Key === failing) {
          await vi.waitFor(() => expect(target.multipartStarted()).toBeGreaterThan(0), {
            timeout: 30_000,
          });
        }
      },
      replace: (command, output) => {
        if (!(command instanceof GetObjectCommand) || command.input.Key !== failing) return output;
        let sent = false;
        const body = new Readable({
          read() {
            if (sent) {
              this.destroy(
                Object.assign(new Error(`connection lost reading ${failing}`), {
                  name: 'RequestTimeout',
                }),
              );
              return;
            }
            sent = true;
            this.push(Buffer.alloc(100, 1));
          },
        });
        return { ...(output as object), Body: body };
      },
    });
    const key = uniqueStorageKey();

    const error = await within(
      copyBucket({ ...bucketOptions(bucket, key), source: source.client, target: target.client }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'GetObject' });
    expect(everything(error)).not.toContain(owner);
    expect(everything(error)).not.toContain(failing);
    expect(target.multipartStarted()).toBeGreaterThan(0);
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it.each([
    ['shorter', 5],
    ['longer', 50],
  ])(
    'fails and stores nothing when a body is %s than its ContentLength',
    async (_name, length) => {
      const bucket = await freshSourceBucket();
      const owner = randomUUID();
      await put(bucket, `keep/users/${owner}/first.jpg`, Buffer.alloc(20, 3));
      await put(bucket, `keep/users/${owner}/wrong.jpg`, Buffer.alloc(20, 4));
      // Not auto-destroyed, so `destroyed` shows that the copy closed the body itself.
      const wrongBody = new Readable({
        autoDestroy: false,
        read() {
          this.push(Buffer.alloc(length, 9));
          this.push(null);
        },
      });
      const source = intercepting({
        replace: (command, output) => {
          if (!(command instanceof GetObjectCommand) || !command.input.Key?.endsWith('wrong.jpg')) {
            return output;
          }
          return { ...(output as object), Body: wrongBody };
        },
      });
      const target = intercepting();
      const key = uniqueStorageKey();

      const error = await within(
        copyBucket({ ...bucketOptions(bucket, key), source: source.client, target: target.client }),
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error).toMatchObject({ operation: 'GetObject', code: 'BodyLengthMismatch' });
      expect(everything(error)).not.toContain(owner);
      expect(wrongBody.destroyed).toBe(true);
      expect(await status(key)).toBe(404);
      expect(await unfinishedUploads(key)).toBe(0);
    },
    120_000,
  );

  it('fails and leaves no upload when a later listing page fails', async () => {
    const bucket = await freshSourceBucket();
    await put(bucket, 'media/a.bin', Buffer.alloc(PART_SIZE + 2 * 1024 * 1024, 5));
    await put(bucket, 'media/b.bin', Buffer.from('small'));
    const target = intercepting();
    let listings = 0;
    const source = intercepting({
      before: async (command) => {
        if (!(command instanceof ListObjectsV2Command)) return;
        listings += 1;
        if (listings < 2) return;
        await vi.waitFor(() => expect(target.multipartStarted()).toBeGreaterThan(0), {
          timeout: 30_000,
        });
        throw Object.assign(new Error('listing broke'), {
          name: 'InternalError',
          $metadata: { httpStatusCode: 500 },
        });
      },
    });
    const key = uniqueStorageKey();

    const error = await within(
      copyBucket({
        ...bucketOptions(bucket, key),
        source: source.client,
        target: target.client,
        pageSize: 1,
      }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'ListObjectsV2', code: 'InternalError', status: 500 });
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it('fails without hanging when an upload part fails while a large object is read', async () => {
    const owner = randomUUID();
    const objects = fakeObjects([
      { key: `keep/users/${owner}/big.bin`, size: 3 * PART_SIZE },
      { key: `keep/users/${owner}/after.bin`, size: PART_SIZE },
    ]);
    const source = intercepting({ answer: objects.answer });
    const target = intercepting({
      before: async (command) => {
        if (command instanceof UploadPartCommand) {
          throw Object.assign(new Error('part refused'), REFUSED_PART);
        }
      },
    });
    const key = uniqueStorageKey();

    const error = await within(
      copyBucket({
        ...bucketOptions('fake-source', key),
        source: source.client,
        target: target.client,
      }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'upload', code: 'InternalError', status: 500 });
    expect(everything(error)).not.toContain(owner);
    expect(target.multipartStarted()).toBeGreaterThan(0);
    // Reading stopped at the first object; the body of it was closed, not left open.
    expect(objects.bodies).toHaveLength(1);
    expect(objects.bodies[0]?.destroyed).toBe(true);
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it('reports the read failure when a part is refused right after the body breaks', async () => {
    const size = 2 * PART_SIZE;
    const objects = fakeObjects([{ key: 'media/a.bin', size }]);
    let broken!: () => void;
    const bodyBroke = new Promise<void>((resolve) => {
      broken = resolve;
    });
    let partStarted!: () => void;
    const partIsOnItsWay = new Promise<void>((resolve) => {
      partStarted = resolve;
    });
    const source = intercepting({
      answer: (command) => {
        const output = objects.answer(command);
        if (!(command instanceof GetObjectCommand)) return output;
        let sent = 0;
        const body = new Readable({
          read() {
            if (sent < PART_SIZE + 1024 * 1024) {
              sent += GENERATED_CHUNK.length;
              this.push(GENERATED_CHUNK);
              return;
            }
            // Past one part: the upload has started, so its failure and this one meet.
            void partIsOnItsWay.then(() => this.destroy(new Error('connection lost')));
          },
        });
        body.on('error', () => broken());
        return { ...(output as object), Body: body };
      },
    });
    const target = intercepting({
      before: async (command) => {
        if (!(command instanceof UploadPartCommand)) return;
        partStarted();
        await bodyBroke;
        throw Object.assign(new Error('part refused'), REFUSED_PART);
      },
    });
    const key = uniqueStorageKey();

    const error = await within(
      copyBucket({
        ...bucketOptions('fake-source', key),
        source: source.client,
        target: target.client,
      }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'GetObject' });
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it.each(['GetObject', 'ListObjectsV2'] as const)(
    'reports the upload failure when a part is refused while reading waits in %s',
    async (waitingIn) => {
      const objects = fakeObjects([
        { key: 'media/a.bin', size: PART_SIZE + 2 * 1024 * 1024 },
        { key: 'media/b.bin', size: 10 },
      ]);
      let reading!: () => void;
      const readingWaits = new Promise<void>((resolve) => {
        reading = resolve;
      });
      let listings = 0;
      const source = intercepting({
        answer: objects.answer,
        before: async (command, options) => {
          const second =
            waitingIn === 'GetObject'
              ? command instanceof GetObjectCommand && command.input.Key === 'media/b.bin'
              : command instanceof ListObjectsV2Command && (listings += 1) === 2;
          if (!second) return;
          reading();
          await whenAborted(options.abortSignal);
          throw aborted();
        },
      });
      const target = intercepting({
        before: async (command) => {
          if (!(command instanceof UploadPartCommand)) return;
          // The part fails only once reading is waiting, so the failure finds it there.
          await readingWaits;
          throw Object.assign(new Error('part refused'), REFUSED_PART);
        },
      });
      const key = uniqueStorageKey();

      const error = await within(
        copyBucket({
          ...bucketOptions('fake-source', key),
          source: source.client,
          target: target.client,
          pageSize: waitingIn === 'ListObjectsV2' ? 1 : undefined,
        }),
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error).toMatchObject({ operation: 'upload', code: 'InternalError', status: 500 });
      expect(await status(key)).toBe(404);
      expect(await unfinishedUploads(key)).toBe(0);
    },
    120_000,
  );

  it('fails with NoContinuationToken when a truncated page names no next one', async () => {
    const bucket = await freshSourceBucket();
    await put(bucket, 'media/a.jpg', Buffer.from('one'));
    await put(bucket, 'media/b.jpg', Buffer.from('two'));
    const target = intercepting();
    const source = intercepting({
      replace: (command, output) =>
        command instanceof ListObjectsV2Command
          ? { ...(output as object), IsTruncated: true, NextContinuationToken: undefined }
          : output,
    });
    const key = uniqueStorageKey();

    const error = await within(
      copyBucket({ ...bucketOptions(bucket, key), source: source.client, target: target.client }),
    );

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'ListObjectsV2', code: 'NoContinuationToken' });
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it('stores nothing when listing fails', async () => {
    const key = uniqueStorageKey();

    const error = await copyBucket(
      bucketOptions(`ai-fitting-test-missing-${randomBytes(4).toString('hex')}`, key),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'ListObjectsV2', code: 'NoSuchBucket' });
    expect(await status(key)).toBe(404);
    expect(await unfinishedUploads(key)).toBe(0);
  }, 120_000);

  it('puts no credential and no object key in a log line or an error', async () => {
    const settings = testStorageSettings();
    const bucket = await freshSourceBucket();
    const owner = randomUUID();
    const objectKeys = [`keep/users/${owner}/photo.jpg`, `media/secret-name-${owner}.jpg`];
    for (const objectKey of objectKeys) await put(bucket, objectKey, Buffer.from('data'));
    const captured = lines();
    const logger = pino({ level: 'trace' }, captured.destination);

    await copyBucket({ ...bucketOptions(bucket, uniqueStorageKey()), logger });
    const wrong = createS3Client(
      { ...settings, secretAccessKey: 'wrongwrongwrongwrong' },
      settings.endpoint,
    );
    const thrown: unknown = await copyBucket({
      ...bucketOptions(bucket, uniqueStorageKey()),
      logger,
      target: wrong,
    }).catch((caught: unknown) => caught);
    wrong.destroy();

    expect(thrown).toBeInstanceOf(StorageError);
    const text = [...captured.output, everything(thrown)].join('\n');
    expect(captured.output.length).toBeGreaterThan(0);
    for (const secret of [
      settings.accessKeyId,
      settings.secretAccessKey,
      'wrongwrongwrongwrong',
      owner,
      ...objectKeys,
    ]) {
      expect(text).not.toContain(secret);
    }
  }, 120_000);

  it('keeps memory far below the size of a 200 MB input', async () => {
    // Neither side touches the emulator: the source makes the 200 MiB in memory and the target
    // counts what it is sent.
    const total = 200 * 1024 * 1024;
    const objects = fakeObjects([{ key: `keep/users/${randomUUID()}/big.bin`, size: total }], true);
    const source = intercepting({ answer: objects.answer });
    let uploaded = 0;

    // The copy streams: with a queue of one, one 8 MiB part is uploading while the next is being
    // filled, plus the encryption and tar buffers. Every read of the source is a fresh buffer, so a
    // copy that held its input would keep at least 200 MB alive, and age's buffered
    // copy and the tar's would come on top. The measure is live memory (heap and array buffers),
    // with a full collection right before the baseline and before each sample, so garbage the
    // collector has not freed yet (what made rss grow on a loaded machine) does not count.
    // A timer cannot sample: the copy keeps the event loop busy and none fires, so the target
    // samples whenever it is handed a part, which is when that part is held in memory.
    const collect = (globalThis as { gc?: () => void }).gc;
    if (!collect) throw new Error('run with --expose-gc (vitest.config.ts, project database)');
    const live = (): number => {
      collect();
      const usage = process.memoryUsage();
      return usage.heapUsed + usage.arrayBuffers;
    };
    const baseline = live();
    let peak = baseline;
    const sample = (): void => {
      peak = Math.max(peak, live());
    };
    const target = intercepting({
      answer: async (command) => {
        if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'fake' };
        if (command instanceof UploadPartCommand) {
          sample();
          uploaded += await sizeOf(command.input.Body);
          return { ETag: `"${command.input.PartNumber}"` };
        }
        if (command instanceof PutObjectCommand) {
          sample();
          uploaded += await sizeOf(command.input.Body);
          return { ETag: '"single"' };
        }
        if (command instanceof CompleteMultipartUploadCommand) return { ETag: '"done"' };
        return undefined;
      },
    });
    const key = uniqueStorageKey();

    const copy = await copyBucket({
      ...bucketOptions('fake-source', key),
      source: source.client,
      target: target.client,
    });
    sample();

    expect(copy).toMatchObject({ objects: 1, objectBytes: total });
    expect(uploaded).toBe(copy.bytes);
    expect(copy.bytes).toBeGreaterThan(total);
    // A streaming copy peaks near 70 MB of live memory; one holding the input is above 200 MB.
    expect(peak - baseline).toBeLessThan(128 * 1024 * 1024);
  }, 300_000);
});

const extraClients: S3Client[] = [];

// The error a run ends with; a run that has not ended in 60 s hangs, and that fails the test.
async function within(run: Promise<unknown>): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const hung = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('copyBucket hangs')), 60_000);
  });
  try {
    return await Promise.race([
      run.then(
        () => 'resolved',
        (caught: unknown) => caught,
      ),
      hung,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function uniqueStorageKey(): string {
  const key = dailyStorageKey(new Date(Date.now() + Math.floor(Math.random() * 1e9) * 1000));
  createdKeys.push(key);
  return key;
}

// A bucket of its own, so a listing holds only the objects of the test that made it; afterEach
// deletes it with its objects.
async function freshSourceBucket(): Promise<string> {
  const bucket = `ai-fitting-test-src-${randomBytes(6).toString('hex')}`;
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  createdBuckets.push(bucket);
  return bucket;
}

async function put(bucket: string, key: string, body: Buffer): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

function bucketOptions(sourceBucket: string, key: string) {
  return {
    recipient,
    source: client,
    sourceBucket,
    target: client,
    targetBucket: BACKUP_BUCKET,
    key,
    logger: quietLogger(),
  };
}

interface Intercepting {
  client: S3Client;
  // CreateMultipartUpload commands sent so far: the upload went past one part.
  multipartStarted: () => number;
}

interface SendOptions {
  abortSignal?: AbortSignal;
}

// A client of the emulator that runs `before` ahead of every command and `after` once it answered.
function intercepting(
  hooks: {
    before?: (command: unknown, options: SendOptions) => Promise<void>;
    after?: (command: unknown) => Promise<void>;
    // Answers a command itself, the emulator is not reached; undefined leaves it to the emulator.
    answer?: (command: unknown) => unknown;
    // Changes what the emulator answered (a body that breaks, a wrong length).
    replace?: (command: unknown, output: unknown) => unknown;
  } = {},
): Intercepting {
  const s3 = createTestS3Client();
  extraClients.push(s3);
  const send = s3.send.bind(s3) as (command: unknown, options?: unknown) => Promise<unknown>;
  let started = 0;
  (s3 as unknown as { send: typeof send }).send = async (command, options) => {
    if (command instanceof CreateMultipartUploadCommand) started += 1;
    await hooks.before?.(command, (options ?? {}) as SendOptions);
    const faked = await hooks.answer?.(command);
    const output = faked !== undefined ? faked : await send(command, options);
    await hooks.after?.(command);
    return hooks.replace ? hooks.replace(command, output) : output;
  };
  return { client: s3, multipartStarted: () => started };
}

const GENERATED_CHUNK = randomBytes(1024 * 1024);

// `size` bytes made in memory; Infinity never ends.
// `fresh` hands out a new buffer on every read, so a reader that keeps the chunks keeps `size`
// bytes; otherwise every read shares one buffer.
function generated(size: number, autoDestroy = true, fresh = false): Readable {
  let left = size;
  return new Readable({
    autoDestroy,
    read() {
      if (left <= 0) {
        this.push(null);
        return;
      }
      const length = Math.min(left, GENERATED_CHUNK.length);
      left -= length;
      if (fresh) {
        this.push(Buffer.alloc(length, 7));
        return;
      }
      this.push(
        length === GENERATED_CHUNK.length ? GENERATED_CHUNK : GENERATED_CHUNK.subarray(0, length),
      );
    },
  });
}

interface FakeObjects {
  // For `intercepting({ answer })` on the source: listings and reads made in memory.
  answer: (command: unknown) => unknown;
  // The bodies handed out, in the order of the reads.
  bodies: Readable[];
}

function fakeObjects(objects: { key: string; size: number }[], fresh = false): FakeObjects {
  const bodies: Readable[] = [];
  const answer = (command: unknown): unknown => {
    if (command instanceof ListObjectsV2Command) {
      const matching = objects.filter((object) =>
        object.key.startsWith(command.input.Prefix ?? ''),
      );
      const start = Number(command.input.ContinuationToken ?? 0);
      const next = start + (command.input.MaxKeys ?? 1000);
      const truncated = next < matching.length;
      return {
        Contents: matching.slice(start, next).map((object) => ({ Key: object.key })),
        IsTruncated: truncated,
        NextContinuationToken: truncated ? String(next) : undefined,
        $metadata: {},
      };
    }
    if (command instanceof GetObjectCommand) {
      const object = objects.find((candidate) => candidate.key === command.input.Key);
      if (object === undefined) return undefined;
      const body = generated(object.size, true, fresh);
      bodies.push(body);
      return { Body: body, ContentLength: object.size, LastModified: new Date(0), $metadata: {} };
    }
    return undefined;
  };
  return { answer, bodies };
}

const REFUSED_PART = {
  name: 'InternalError',
  $metadata: { httpStatusCode: 500 },
};

function aborted(): Error {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

function whenAborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

// Drains an UploadPart or PutObject body and counts it; nothing is kept.
async function sizeOf(body: unknown): Promise<number> {
  if (body instanceof Uint8Array) return body.length;
  if (typeof body === 'string') return Buffer.byteLength(body);
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) total += chunk.length;
  return total;
}

const createdBuckets: string[] = [];
const createdKeys: string[] = [];

afterEach(async () => {
  for (const bucket of createdBuckets.splice(0)) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    const keys = (listed.Contents ?? []).flatMap((object) =>
      object.Key === undefined ? [] : [{ Key: object.Key }],
    );
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    }
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  for (const key of createdKeys.splice(0)) {
    await client.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }));
  }
}, 60_000);

async function unfinishedUploads(key: string): Promise<number> {
  const listed = await client.send(
    new ListMultipartUploadsCommand({ Bucket: BACKUP_BUCKET, Prefix: key }),
  );
  return (listed.Uploads ?? []).filter((upload) => upload.Key === key).length;
}

// Decrypts and unpacks a stored archive: entry name to its bytes.
async function restoredEntries(key: string): Promise<Record<string, Buffer>> {
  const object = await client.send(new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }));
  const encrypted = await object.Body?.transformToByteArray();
  if (encrypted === undefined) throw new Error('no body');
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const tar = await decrypter.decrypt(encrypted);

  const unpacker = extract();
  Readable.from([Buffer.from(tar)]).pipe(unpacker);
  const entries: Record<string, Buffer> = {};
  for await (const entry of unpacker) {
    const chunks: Buffer[] = [];
    for await (const chunk of entry) chunks.push(chunk as Buffer);
    entries[entry.header.name] = Buffer.concat(chunks);
  }
  return entries;
}

async function createEmptyDatabase(): Promise<string> {
  const name = `restored_${Math.random().toString(16).slice(2)}`;
  const adminUrl = inject('adminDatabaseUrl');
  const admin = prismaOf(adminUrl);
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
