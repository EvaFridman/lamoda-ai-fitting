import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';

import {
  copyDatabase,
  type DatabaseCopy,
  type DatabaseCopyOptions,
  startTool,
  toolEnvironment,
} from './database.js';
import { preDeployDatabaseKey } from './keys.js';

export interface PreDeployCopyOptions extends Omit<DatabaseCopyOptions, 'key'> {
  // The image tag being deployed, a commit SHA: part of the copy's name (plan §2).
  tag: string;
  // The copy's name stamp.
  at: Date;
  // The release's migration folders: those of this image, by default.
  migrationsDir?: string;
}

// `prisma/migrations` of the image: dist/backup/ (or src/backup/ in the tests) is two levels down.
export const IMAGE_MIGRATIONS_DIR = fileURLToPath(
  new URL('../../prisma/migrations/', import.meta.url),
);

// The copy before a deploy migrates (plan §5, P3): only when the release brings a migration the
// database has not applied (AC2); none, no copy (AC3). Returns the copy, or undefined when none was
// needed. Throws before dumping for a tag that is not a SHA, and like copyDatabase on a failure.
// The tag is checked only when a copy is due: the deploy check's own tags (`<sha>-next`) bring no
// migration and need none.
export async function copyBeforeMigrations(
  options: PreDeployCopyOptions,
): Promise<DatabaseCopy | undefined> {
  const { logger, migrationsDir = IMAGE_MIGRATIONS_DIR, tag, at, ...copy } = options;
  const migrations = await newMigrations({ ...options, migrationsDir });
  if (migrations.length === 0) {
    logger.info({ tag }, 'No new migration, no copy before the deploy');
    return undefined;
  }
  const key = preDeployDatabaseKey(at, tag);
  logger.info({ tag, migrations }, 'New migrations: copying the database before the deploy');
  return copyDatabase({ ...copy, logger, key });
}

// The release's migration folders the database has not finished applying; every one when it has
// no `_prisma_migrations` table yet.
export async function newMigrations(
  options: Pick<PreDeployCopyOptions, 'databaseUrl' | 'logger' | 'toolPrefix' | 'toolEnv'> & {
    migrationsDir: string;
  },
): Promise<string[]> {
  const entries = await readdir(options.migrationsDir, { withFileTypes: true });
  const release = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const query = (sql: string) => psql(sql, options);
  const exists = await query(`SELECT to_regclass('_prisma_migrations') IS NOT NULL`);
  if (exists.trim() !== 't') return release;
  const applied = new Set(
    (await query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL'))
      .split('\n')
      .filter((name) => name !== ''),
  );
  return release.filter((name) => !applied.has(name));
}

// One query's rows, one per line, unaligned; a failed one rejects with DatabaseCopyError.
async function psql(
  sql: string,
  options: Pick<PreDeployCopyOptions, 'databaseUrl' | 'logger' | 'toolPrefix' | 'toolEnv'>,
): Promise<string> {
  const tool = startTool(
    'psql',
    ['--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', sql],
    {
      prefix: options.toolPrefix ?? [],
      env: toolEnvironment(options.databaseUrl, options.toolEnv),
      logger: options.logger,
      output: true,
    },
  );
  const chunks: Buffer[] = [];
  (tool.child.stdout as Readable).on('data', (chunk: Buffer) => chunks.push(chunk));
  await tool.exited;
  return Buffer.concat(chunks).toString('utf8');
}
