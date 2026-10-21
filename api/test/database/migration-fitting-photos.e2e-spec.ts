import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaClient, type Prisma } from '../../src/generated/prisma/client.js';
import { CATALOG } from '../../src/seed/catalog.data.js';
import { SeedService } from '../../src/seed/seed.service.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestDatabaseUrl } from '../support/test-database.js';
import { expectViolation } from '../support/violation.js';

// Migration 20261021120000_fitting_photos (spec 0019, plan §2) on a database that the seed filled
// before it: the seed never changes an existing row, so the migration gives the demo categories
// their slots (A18), and the new tables carry the rules the plan names. The database is a copy of
// the migrated template, put back into the state before the migration.
const MIGRATION = '20261021120000_fitting_photos';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

let db: PrismaClient;
let otherCategorySlug: string;

beforeAll(async () => {
  // The photos do not matter here: the storage says every file is there and keeps none.
  const storage = {
    exists: vi.fn().mockResolvedValue(true),
    put: vi.fn(),
  } as unknown as StorageService;
  const url = await createTestDatabaseUrl();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  await new SeedService(db, storage).run();
  // A category the migration does not know: it must keep no slot.
  otherCategorySlug = `other-${randomUUID()}`;
  await db.category.create({
    data: { name: `Other ${randomUUID()}`, slug: otherCategorySlug, isActive: true },
  });

  // The state before the migration: no tables, no column, no types, the migration not recorded.
  await db.$executeRawUnsafe('DROP TABLE user_photos, fitting_quota, file_deletions');
  await db.$executeRawUnsafe('ALTER TABLE categories DROP COLUMN slot');
  await db.$executeRawUnsafe('DROP TYPE outfit_slot, file_deletion_kind');
  await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;

  await run(join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

async function createUser() {
  return db.user.create({ data: { email: `${randomUUID()}@example.com` } });
}

function photo(userId: string, patch: Partial<Prisma.UserPhotoUncheckedCreateInput>) {
  return db.userPhoto.create({
    data: {
      userId,
      imageKey: `keep/users/${userId}/photos/${randomUUID()}.webp`,
      width: 1,
      height: 1,
      ...patch,
    },
  });
}

describe('migration fitting_photos', () => {
  it('gives the demo categories their slots and leaves another category without one (A18)', async () => {
    const rows = await db.category.findMany({ select: { slug: true, slot: true } });
    for (const { slug, slot } of CATALOG.categories) {
      expect(rows.find((r) => r.slug === slug)?.slot, slug).toBe(slot);
    }
    expect(rows.find((r) => r.slug === otherCategorySlug)?.slot).toBeNull();
    expect(rows.filter((r) => r.slot !== null)).toHaveLength(CATALOG.categories.length);
  });

  it('records the migration', async () => {
    const recorded = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`;
    expect(recorded[0]?.n).toBe(1);
  });

  it('keeps one default photo per user and any number of others (A31)', async () => {
    const user = await createUser();
    const other = await createUser();
    await photo(user.id, { isDefault: true });
    await photo(user.id, {});
    await photo(user.id, { transient: true });
    await photo(other.id, { isDefault: true });
    await expectViolation(photo(user.id, { isDefault: true }), 'user_photos_user_id_key');
    expect(await db.userPhoto.count({ where: { userId: user.id } })).toBe(3);
  });

  it('refuses a bad key, a key outside the owner folder and an empty picture (0002 C22, 0011 M7)', async () => {
    const user = await createUser();
    await expectViolation(
      photo(user.id, { imageKey: `keep/users/${user.id}/../x.webp` }),
      'user_photos_image_key_check',
    );
    await expectViolation(
      photo(user.id, { imageKey: '/absolute.webp' }),
      'user_photos_image_key_check',
    );
    await expectViolation(
      photo(user.id, { imageKey: `keep/users/${randomUUID()}/photos/x.webp` }),
      'user_photos_image_key_check',
    );
    await expectViolation(
      photo(user.id, { imageKey: `media/users/${user.id}/photos/x.webp` }),
      'user_photos_image_key_check',
    );
    await expectViolation(photo(user.id, { width: 0 }), 'user_photos_width_check');
    await expectViolation(photo(user.id, { height: 0 }), 'user_photos_height_check');
  });

  it('keeps the spend per user and month, never below zero (A20)', async () => {
    const user = await createUser();
    await db.fittingQuota.create({ data: { userId: user.id, month: '2026-10', used: 1 } });
    await expectViolation(
      db.fittingQuota.create({ data: { userId: user.id, month: '2026-10', used: 2 } }),
      'fitting_quota_pkey',
    );
    await expectViolation(
      db.fittingQuota.create({ data: { userId: user.id, month: '2026-13', used: 0 } }),
      'fitting_quota_month_check',
    );
    await expectViolation(
      db.fittingQuota.create({ data: { userId: user.id, month: '2026-11', used: -1 } }),
      'fitting_quota_used_check',
    );
    await expectViolation(
      db.fittingQuota.create({ data: { userId: randomUUID(), month: '2026-11' } }),
      'fitting_quota_user_id_fkey',
    );
  });

  it('keeps one deletion per row with at least one folder (A38)', async () => {
    const rowId = randomUUID();
    const row = await db.fileDeletion.create({
      data: { kind: 'photo', rowId, prefixes: [`keep/users/${randomUUID()}/photos/${rowId}/`] },
    });
    expect(row.startedAt).toBeNull();
    await expectViolation(
      db.fileDeletion.create({ data: { kind: 'photo', rowId, prefixes: ['keep/users/x/'] } }),
      'file_deletions_kind_row_id_key',
    );
    await expectViolation(
      db.fileDeletion.create({ data: { kind: 'user', rowId: randomUUID(), prefixes: [] } }),
      'file_deletions_prefixes_check',
    );
    // A list left out is written as NULL, which a plain CHECK would let through.
    await expectViolation(
      db.fileDeletion.create({ data: { kind: 'user', rowId: randomUUID() } }),
      'file_deletions_prefixes_check',
    );
  });

  it('deletes the photos and the spend with the user', async () => {
    const user = await createUser();
    await photo(user.id, { isDefault: true });
    await db.fittingQuota.create({ data: { userId: user.id, month: '2026-10', used: 3 } });
    await db.user.delete({ where: { id: user.id } });
    expect(await db.userPhoto.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.fittingQuota.count({ where: { userId: user.id } })).toBe(0);
  });
});
