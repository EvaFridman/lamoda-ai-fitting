import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { inject } from 'vitest';

import { PrismaClient } from '../../src/generated/prisma/client.js';

// A database of the test file's own, copied from the migrated template of database.ts, and a
// client for it built the way PrismaService builds it (pg driver adapter). Call once per file in
// `beforeAll` and `$disconnect()` in `afterAll`; the container goes away with the run.
export async function createTestDatabase(): Promise<PrismaClient> {
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = inject('adminDatabaseUrl');

  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    // Identifiers cannot be bound as parameters; both names are ours (a UUID and a constant).
    await admin.$executeRawUnsafe(
      `CREATE DATABASE "${name}" TEMPLATE "${inject('templateDatabase')}"`,
    );
  } finally {
    await admin.$disconnect();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
}
