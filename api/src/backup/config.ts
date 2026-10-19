import type { S3Client } from '@aws-sdk/client-s3';
import { Encrypter } from 'age-encryption';
import { z } from 'zod';

import { envSchema } from '../config/env.js';
import { createS3Client } from '../storage/s3-client.provider.js';

const api = envSchema.shape;

function isToolDatabaseUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  try {
    // Malformed percent-encoding passes URL but not decodeURIComponent.
    postgresEnv(value);
  } catch {
    return false;
  }
  return (
    url.hostname !== '' &&
    url.pathname.length > 1 &&
    // One segment: `/db/extra` would reach the tools as the database `db/extra`.
    !url.pathname.slice(1).includes('/') &&
    // The tools use the default `search_path`, so only `public`: under another schema the
    // pre-deploy check would miss `_prisma_migrations` and copy on every deploy.
    [...url.searchParams].every(([name, value]) => name === 'schema' && value === 'public')
  );
}

// A key of the provider's: any non-space characters, as for the api's (spec 0011 M19).
const s3Key = () => z.string().regex(/^\S+$/, 'must be set, with no spaces');

// Every environment variable the backup job reads (spec 0012 plan §1). Its own schema, not the
// api's: the job needs neither Redis, Temporal nor the api's S3 key, which that one demands. The
// rules of the variables both share are the api's.
export const backupEnvSchema = z
  .object({
    LOG_LEVEL: api.LOG_LEVEL,
    APP_VERSION: api.APP_VERSION,
    // Also a URL the tools' variables can be parsed from (postgresEnv), checked at start rather
    // than in the night's run; only Prisma's `schema=public` is allowed, as any other parameter
    // (e.g. `sslmode`) would be dropped for the tools.
    DATABASE_URL: api.DATABASE_URL.refine(isToolDatabaseUrl, {
      message:
        'must be a postgresql://user:password@host/db URL with no parameter but schema=public',
    }),

    // Shared by both buckets.
    S3_ENDPOINT: api.S3_ENDPOINT,
    S3_REGION: api.S3_REGION,
    // The app's bucket, read with a key that can only list and read it (P9, P11).
    S3_BUCKET: api.S3_BUCKET,
    BACKUP_READ_ACCESS_KEY_ID: s3Key(),
    BACKUP_READ_SECRET_ACCESS_KEY: s3Key(),
    // The backup bucket, written with a key that can only upload there (P11): the job never reads,
    // lists or deletes in it.
    BACKUP_BUCKET: api.S3_BUCKET,
    BACKUP_WRITE_ACCESS_KEY_ID: s3Key(),
    BACKUP_WRITE_SECRET_ACCESS_KEY: s3Key(),
    // The owner's age public key (P5): every copy is encrypted to it, and only the owner's private
    // key decrypts. An X25519 key, the shape CD checks too (plan §6), and one age itself accepts,
    // so a key it would refuse stops the job at start.
    BACKUP_AGE_RECIPIENT: z
      .string()
      // abort: one message, not this and age's too.
      .regex(/^age1[0-9a-z]{58}$/, { message: 'must be an age public key (age1…)', abort: true })
      .superRefine((value, context) => {
        try {
          new Encrypter().addRecipient(value);
        } catch {
          context.addIssue({ code: 'custom', message: 'must be an age public key (age1…)' });
        }
      }),

    // The api's Sentry project (P6); empty turns Sentry and the monitor off.
    SENTRY_DSN: api.SENTRY_DSN,
    SENTRY_ENVIRONMENT: api.SENTRY_ENVIRONMENT,
  })
  // A copy written into the bucket it copies would expire with the app's files or overwrite them.
  .refine((env) => env.BACKUP_BUCKET !== env.S3_BUCKET, {
    path: ['BACKUP_BUCKET'],
    message: 'must differ from S3_BUCKET',
  });

export type BackupEnv = z.infer<typeof backupEnvSchema>;

// The messages name the variables, never their values.
export function validateBackupEnv(raw: Record<string, unknown>): BackupEnv {
  const result = backupEnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

// The connection of pg_dump, pg_restore and psql, as libpq's variables: on the command line the
// password would show in `ps` (plan §1). The database URL's own parameters (`?schema=`) are
// Prisma's, not libpq's, and are left out.
export function postgresEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
}

// The job's two clients, both built like the api's (forcePathStyle, checksums only when required,
// the connection timeout) but with a longer socket timeout. `destroy()` them when the job ends.
export interface BackupClients {
  // Lists and reads the app bucket.
  read: S3Client;
  // Uploads into the backup bucket.
  write: S3Client;
}

// The bucket copy reads an object while a part uploads, and the read's socket is silent until the
// part is sent: the api's 10 s would end the copy whenever a part takes longer (P18).
export const BACKUP_S3_SOCKET_TIMEOUT_MS = 60_000;

export function createBackupClients(env: BackupEnv): BackupClients {
  return {
    read: createS3Client(
      {
        region: env.S3_REGION,
        accessKeyId: env.BACKUP_READ_ACCESS_KEY_ID,
        secretAccessKey: env.BACKUP_READ_SECRET_ACCESS_KEY,
      },
      env.S3_ENDPOINT,
      BACKUP_S3_SOCKET_TIMEOUT_MS,
    ),
    write: createS3Client(
      {
        region: env.S3_REGION,
        accessKeyId: env.BACKUP_WRITE_ACCESS_KEY_ID,
        secretAccessKey: env.BACKUP_WRITE_SECRET_ACCESS_KEY,
      },
      env.S3_ENDPOINT,
      BACKUP_S3_SOCKET_TIMEOUT_MS,
    ),
  };
}
