import { generateHybridIdentity, generateIdentity, identityToRecipient } from 'age-encryption';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  BACKUP_S3_SOCKET_TIMEOUT_MS,
  createBackupClients,
  postgresEnv,
  validateBackupEnv,
} from './config.js';

let recipient: string;
let identity: string;

beforeAll(async () => {
  identity = await generateIdentity();
  recipient = await identityToRecipient(identity);
});

function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://app:pw@postgres:5432/app',
    S3_ENDPOINT: 'https://s3.example.com',
    S3_BUCKET: 'app-files',
    BACKUP_READ_ACCESS_KEY_ID: 'read-key-id',
    BACKUP_READ_SECRET_ACCESS_KEY: 'read-secret-value',
    BACKUP_BUCKET: 'app-backups',
    BACKUP_WRITE_ACCESS_KEY_ID: 'write-key-id',
    BACKUP_WRITE_SECRET_ACCESS_KEY: 'write-secret-value',
    BACKUP_AGE_RECIPIENT: recipient,
  };
}

function messageOf(raw: Record<string, unknown>): string {
  try {
    validateBackupEnv(raw);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('validateBackupEnv did not throw');
}

describe('validateBackupEnv', () => {
  it('parses a valid environment and fills the defaults', () => {
    const env = validateBackupEnv(validEnv());
    expect(env).toMatchObject({
      LOG_LEVEL: 'info',
      APP_VERSION: 'dev',
      S3_REGION: 'ru-1',
      SENTRY_DSN: '',
      SENTRY_ENVIRONMENT: '',
      BACKUP_BUCKET: 'app-backups',
      BACKUP_AGE_RECIPIENT: recipient,
    });
  });

  it('keeps given optional values', () => {
    const env = validateBackupEnv({
      ...validEnv(),
      LOG_LEVEL: 'debug',
      APP_VERSION: 'abc1234',
      S3_REGION: 'eu-1',
      SENTRY_DSN: 'https://key@sentry.example.com/1',
      SENTRY_ENVIRONMENT: 'production',
    });
    expect(env).toMatchObject({
      LOG_LEVEL: 'debug',
      APP_VERSION: 'abc1234',
      S3_REGION: 'eu-1',
      SENTRY_DSN: 'https://key@sentry.example.com/1',
      SENTRY_ENVIRONMENT: 'production',
    });
  });

  it.each([
    ['DATABASE_URL', undefined],
    ['DATABASE_URL', 'mysql://u:p@h/db'],
    ['S3_ENDPOINT', undefined],
    ['S3_ENDPOINT', 'not a url'],
    ['S3_BUCKET', 'A'],
    ['BACKUP_BUCKET', 'Bad_Bucket'],
    ['BACKUP_BUCKET', undefined],
    ['BACKUP_READ_ACCESS_KEY_ID', 'has space'],
    ['BACKUP_READ_SECRET_ACCESS_KEY', 'has space'],
    ['BACKUP_WRITE_ACCESS_KEY_ID', undefined],
    ['BACKUP_WRITE_SECRET_ACCESS_KEY', 'two words'],
    ['BACKUP_AGE_RECIPIENT', 'age1nope'],
    ['BACKUP_AGE_RECIPIENT', undefined],
  ])('refuses %s = %s and names the variable', (name, value) => {
    const raw: Record<string, unknown> = { ...validEnv(), [name]: value };
    if (value === undefined) delete raw[name];
    expect(messageOf(raw)).toContain(name);
  });

  it('refuses an age private key as the recipient, without printing it', () => {
    const message = messageOf({ ...validEnv(), BACKUP_AGE_RECIPIENT: identity });
    expect(message).toContain('BACKUP_AGE_RECIPIENT');
    expect(message).not.toContain(identity);
  });

  it('refuses a post-quantum recipient, without printing it', async () => {
    const hybrid = await identityToRecipient(await generateHybridIdentity());
    expect(hybrid.startsWith('age1pq1')).toBe(true);
    const message = messageOf({ ...validEnv(), BACKUP_AGE_RECIPIENT: hybrid });
    expect(message).toContain('BACKUP_AGE_RECIPIENT');
    expect(message).not.toContain(hybrid);
  });

  it('refuses a recipient of the right shape that age itself rejects', () => {
    const shaped = `age1${'a'.repeat(58)}`;
    expect(shaped).toMatch(/^age1[0-9a-z]{58}$/);
    expect(messageOf({ ...validEnv(), BACKUP_AGE_RECIPIENT: shaped })).toContain(
      'BACKUP_AGE_RECIPIENT',
    );
  });

  it('refuses an upper-case recipient', () => {
    expect(messageOf({ ...validEnv(), BACKUP_AGE_RECIPIENT: recipient.toUpperCase() })).toContain(
      'BACKUP_AGE_RECIPIENT',
    );
  });

  it('reports an invalid recipient once, not once per rule', () => {
    const message = messageOf({ ...validEnv(), BACKUP_AGE_RECIPIENT: 'nope' });
    expect(message.split('BACKUP_AGE_RECIPIENT')).toHaveLength(2);
  });

  it('refuses a malformed percent-encoding in the database URL, without printing it', () => {
    const message = messageOf({ ...validEnv(), DATABASE_URL: 'postgresql://u:p%zz@h/db' });
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('p%zz');
  });

  it('accepts the schema parameter of Prisma in the database URL', () => {
    const env = validateBackupEnv({
      ...validEnv(),
      DATABASE_URL: 'postgresql://app:pw@postgres:5432/app?schema=public',
    });
    expect(env.DATABASE_URL).toContain('schema=public');
  });

  it.each([
    ['another query parameter', 'postgresql://app:db-pw-2@postgres/app?sslmode=require'],
    ['schema with another parameter', 'postgresql://app:db-pw-2@postgres/app?schema=a&sslmode=x'],
    ['a host with a space', 'postgresql://app:db-pw-2@ho st/app'],
    ['no database', 'postgresql://app:db-pw-2@postgres'],
    ['an empty database', 'postgresql://app:db-pw-2@postgres/'],
    ['no host', 'postgresql://app:db-pw-2@/app'],
  ])('refuses a database URL with %s, naming it and never the password', (_label, url) => {
    const message = messageOf({ ...validEnv(), DATABASE_URL: url });
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('db-pw-2');
  });

  it('refuses the app bucket as the backup bucket', () => {
    const message = messageOf({ ...validEnv(), BACKUP_BUCKET: 'app-files' });
    expect(message).toContain('BACKUP_BUCKET');
    expect(message).toContain('S3_BUCKET');
  });

  it('never prints a secret value in the message', () => {
    const message = messageOf({
      ...validEnv(),
      DATABASE_URL: 'mysql://app:passpasspass@h/db',
      BACKUP_READ_SECRET_ACCESS_KEY: 'secret with space',
      BACKUP_WRITE_SECRET_ACCESS_KEY: 'another secret',
    });
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('BACKUP_READ_SECRET_ACCESS_KEY');
    expect(message).not.toContain('passpasspass');
    expect(message).not.toContain('secret with space');
    expect(message).not.toContain('another secret');
  });
});

describe('postgresEnv', () => {
  it('splits the URL into libpq variables', () => {
    expect(postgresEnv('postgresql://app:pw@db.internal:6543/appdb')).toEqual({
      PGHOST: 'db.internal',
      PGPORT: '6543',
      PGUSER: 'app',
      PGPASSWORD: 'pw',
      PGDATABASE: 'appdb',
    });
  });

  it('defaults the port to 5432', () => {
    expect(postgresEnv('postgres://app:pw@db/appdb').PGPORT).toBe('5432');
  });

  it('decodes a percent-encoded user and password', () => {
    const env = postgresEnv('postgresql://us%40er:p%2Fp%3Ap%25@db/ap%20p');
    expect(env.PGUSER).toBe('us@er');
    expect(env.PGPASSWORD).toBe('p/p:p%');
    expect(env.PGDATABASE).toBe('ap p');
  });

  it('ignores query parameters', () => {
    const env = postgresEnv('postgresql://app:pw@db:5432/appdb?schema=public&sslmode=require');
    expect(env.PGDATABASE).toBe('appdb');
    expect(Object.keys(env).sort()).toEqual([
      'PGDATABASE',
      'PGHOST',
      'PGPASSWORD',
      'PGPORT',
      'PGUSER',
    ]);
  });
});

describe('createBackupClients', () => {
  it('builds a read and a write client with their own keys', async () => {
    const clients = createBackupClients(validateBackupEnv(validEnv()));
    try {
      const read = await clients.read.config.credentials();
      const write = await clients.write.config.credentials();
      expect(read.accessKeyId).toBe('read-key-id');
      expect(read.secretAccessKey).toBe('read-secret-value');
      expect(write.accessKeyId).toBe('write-key-id');
      expect(write.secretAccessKey).toBe('write-secret-value');
      expect(await clients.read.config.region()).toBe('ru-1');
    } finally {
      clients.read.destroy();
      clients.write.destroy();
    }
  });

  it('gives both clients a 60 s socket timeout and a 5 s connection timeout', async () => {
    const clients = createBackupClients(validateBackupEnv(validEnv()));
    try {
      expect(BACKUP_S3_SOCKET_TIMEOUT_MS).toBe(60_000);
      for (const client of [clients.read, clients.write]) {
        const handler = client.config.requestHandler as unknown as {
          configProvider: Promise<{ connectionTimeout?: number; socketTimeout?: number }>;
        };
        const options = await handler.configProvider;
        expect(options.socketTimeout).toBe(BACKUP_S3_SOCKET_TIMEOUT_MS);
        expect(options.connectionTimeout).toBe(5000);
      }
    } finally {
      clients.read.destroy();
      clients.write.destroy();
    }
  });
});
