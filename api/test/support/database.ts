import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Vitest globalSetup of the `database` project (vitest.config.ts): one throwaway PostgreSQL for
// the run (spec 0002, C19). The migrations go into a template database; each test file copies it
// into a database of its own (test-database.ts), so files run in parallel without sharing rows.
// Never the development database, and never skipped: without Docker the run fails.

const TEMPLATE_DATABASE = 'migrated';

// The image of the compose `postgres` service (the one production runs too), read from the file so
// a version bump cannot leave the tests on the old one: the CHECK regexes run under the same build
// and locale.
async function postgresImage(apiRoot: string): Promise<string> {
  const compose = await readFile(join(apiRoot, '..', 'docker-compose.yml'), 'utf8');
  const image = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose)?.[1];
  if (image === undefined) {
    throw new Error('No `image: postgres:<tag>` line found in docker-compose.yml.');
  }
  return image;
}

declare module 'vitest' {
  export interface ProvidedContext {
    // Address of the container's `postgres` database: test files connect there to create theirs.
    adminDatabaseUrl: string;
    templateDatabase: string;
  }
}

const run = promisify(execFile);

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const root = project.config.root;
  const image = await postgresImage(root);
  // No Ryuk, Testcontainers' cleanup container: it holds the Docker socket and removes containers
  // and volumes by label for anyone who reaches its port, and Docker Desktop publishes that port on
  // every interface (spec 0002, C24). The teardown below removes the container; a killed run
  // leaves it behind (label `org.testcontainers=true`). Read when the container starts.
  process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';
  let container: StartedPostgreSqlContainer;
  try {
    // The container's own database is `postgres`, which Testcontainers' health check polls during
    // the whole run: a session on the template would make `CREATE DATABASE … TEMPLATE` wait and
    // fail. The published port is reachable from the network while the run lasts, so the
    // password is random per run, not the library's default `test`.
    container = await new PostgreSqlContainer(image)
      .withDatabase('postgres')
      .withPassword(randomBytes(24).toString('hex'))
      .start();
  } catch (error) {
    throw new Error(
      'The database tests (api/test/database) could not start a PostgreSQL container. ' +
        'Is Docker running? Start Docker and run the tests again.',
      { cause: error },
    );
  }

  const adminUrl = container.getConnectionUri();
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DATABASE}`;
  try {
    // The Prisma CLI of this package, the way deploys apply migrations; it creates the template
    // database. Its connections end with the process, so the template has no sessions left when
    // test files copy it. cwd: the binary and prisma.config.ts are found from the api root.
    await run(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: templateUrl.toString() },
    });
  } catch (error) {
    await container.stop();
    throw new Error('prisma migrate deploy failed on the test database.', { cause: error });
  }

  project.provide('adminDatabaseUrl', adminUrl);
  project.provide('templateDatabase', TEMPLATE_DATABASE);

  return async () => {
    await container.stop();
  };
}
