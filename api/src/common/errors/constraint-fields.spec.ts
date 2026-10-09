import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONSTRAINT_FIELDS, constraintFields } from './constraint-fields.js';

function migrationConstraintNames(): string[] {
  const root = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));
  const names = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = readFileSync(`${root}${entry.name}/migration.sql`, 'utf8');
    for (const match of sql.matchAll(/(?:CONSTRAINT|UNIQUE INDEX)\s+"([^"]+)"/g)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
  }
  return [...names];
}

describe('CONSTRAINT_FIELDS', () => {
  it('has a row for every constraint and unique index in the migrations', () => {
    const names = migrationConstraintNames();
    expect(names.length).toBeGreaterThan(0);

    // Primary keys are generated ids; a write cannot break them.
    const missing = names.filter(
      (name) => !name.endsWith('_pkey') && !Object.hasOwn(CONSTRAINT_FIELDS, name),
    );
    expect(missing).toEqual([]);
  });

  it('has no row for a constraint that no migration creates', () => {
    const names = new Set(migrationConstraintNames());
    const stale = Object.keys(CONSTRAINT_FIELDS).filter((name) => !names.has(name));
    expect(stale).toEqual([]);
  });

  it('constraintFields gives the fields of a known name and nothing for an unknown one', () => {
    expect(constraintFields('products_brand_id_fkey')).toEqual(['brandId']);
    expect(constraintFields('no_such_constraint')).toEqual([]);
    expect(constraintFields('toString')).toEqual([]);
    expect(constraintFields(undefined)).toEqual([]);
  });
});
