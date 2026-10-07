import { expect } from 'vitest';

import { Prisma } from '../../src/generated/prisma/client.js';

// Where a constraint's name sits in an error of the generated client under the pg driver adapter
// (Prisma 7.10), pinned in spec 0002 T3:
// - unique (23505), foreign key (23503) and RESTRICT on delete (23001):
//   `meta.driverAdapterError.cause.constraint.index`;
// - CHECK (23514) has no `constraint` field: the name is only in `cause.originalMessage`
//   (`... violates check constraint "users_phone_check"`), for model calls and raw SQL alike.
// A value longer than its varchar (22001) names no constraint; it is not a violation here.
interface DriverAdapterCause {
  originalCode?: string;
  originalMessage?: string;
  constraint?: { index?: string };
}

function constraintName(cause: DriverAdapterCause): string | undefined {
  if (cause.constraint?.index !== undefined) return cause.constraint.index;
  // CHECK, and a fallback should the adapter ever report columns (`constraint.fields`) instead of
  // the name: Postgres's own message names the constraint for all of these errors.
  return /constraint "([^"]+)"/.exec(cause.originalMessage ?? '')?.[1];
}

// Expects the write to be refused by the database because of the named constraint: a CHECK
// (`<table>_<column>_check`), a unique index (`<table>_<columns>_key`) or a foreign key
// (`<table>_<column>_fkey`). Fails if the write succeeds or fails for any other reason.
export async function expectViolation(write: Promise<unknown>, name: string): Promise<void> {
  const error: unknown = await write.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error === undefined) {
    expect.fail(`expected the database to refuse the write with ${name}, but it was accepted`);
  }
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta as
    { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined;
  const cause = meta?.driverAdapterError?.cause;
  expect(cause, `no driver adapter error in: ${String(error)}`).toBeDefined();
  expect(constraintName(cause as DriverAdapterCause), cause?.originalMessage).toBe(name);
}
