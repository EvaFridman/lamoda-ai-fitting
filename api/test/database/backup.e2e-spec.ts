import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { copyDatabase, DatabaseCopyError } from '../../src/backup/database.js';
import { postgresEnv } from '../../src/backup/config.js';
import { dailyDatabaseKey } from '../../src/backup/keys.js';
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
});

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
