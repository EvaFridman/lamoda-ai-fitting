import type { Prisma } from '../../generated/prisma/client.js';

// Money and rating are JSON numbers (spec 0004 E6): each module's mapper turns Prisma's Decimal
// into one, there is no global interceptor. `Decimal(10, 2)` fits a number exactly.
export function decimalToNumber(value: Prisma.Decimal): number;
export function decimalToNumber(value: Prisma.Decimal | null): number | null;
export function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}
