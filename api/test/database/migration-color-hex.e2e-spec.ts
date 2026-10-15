import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../src/generated/prisma/client.js';
import { CATALOG, COLOUR } from '../../src/seed/catalog.data.js';
import { SeedService } from '../../src/seed/seed.service.js';
import { createTestDatabaseUrl } from '../support/test-database.js';

// Migration 20261015120000_attribute_values_color_hex (spec 0009, K12) on a database that the seed
// filled before it: the seed never changes an existing row, so the migration gives the ten colours
// their hex. The database is a copy of the migrated template, put back into the state before.
const MIGRATION = '20261015120000_attribute_values_color_hex';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

let db: PrismaClient;
let otherAttributeName: string;

beforeAll(async () => {
  const url = await createTestDatabaseUrl();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  await new SeedService(db).run();
  const other = await db.attribute.create({ data: { name: `Other ${randomUUID()}` } });
  otherAttributeName = other.name;
  // The text of a colour under another attribute, and a colour of the colour attribute that is
  // not in the seed: neither may get a hex.
  await db.attributeValue.create({ data: { attributeId: other.id, value: 'чёрный' } });
  const colourAttribute = await db.attribute.findFirstOrThrow({ where: { name: COLOUR } });
  await db.attributeValue.create({
    data: { attributeId: colourAttribute.id, value: 'пурпурный' },
  });

  // The state before the migration: no column, the migration not recorded.
  await db.$executeRawUnsafe('ALTER TABLE attribute_values DROP COLUMN color_hex');
  await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;

  await run(join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('migration attribute_values_color_hex', () => {
  const colours = CATALOG.attributes.find((a) => a.name === COLOUR)?.values ?? [];

  it('gives the ten seed colours their hex and leaves every other value null (spec 0009 AC1)', async () => {
    const rows = await db.attributeValue.findMany({
      select: { value: true, colorHex: true, attribute: { select: { name: true } } },
    });
    expect(colours).toHaveLength(10);
    for (const { value, colorHex } of colours) {
      const row = rows.find((r) => r.attribute.name === COLOUR && r.value === value);
      expect(row?.colorHex, value).toBe(colorHex);
    }
    expect(rows.filter((r) => r.colorHex !== null)).toHaveLength(10);
    expect(rows.find((r) => r.value === 'пурпурный')?.colorHex).toBeNull();
    expect(
      rows.find((r) => r.attribute.name === otherAttributeName && r.value === 'чёрный')?.colorHex,
    ).toBeNull();
  });

  it('records the migration and keeps the CHECK on the re-added column', async () => {
    const recorded = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`;
    expect(recorded[0]?.n).toBe(1);
    const checks = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE conname = 'attribute_values_color_hex_check'`;
    expect(checks[0]?.n).toBe(1);
  });
});
