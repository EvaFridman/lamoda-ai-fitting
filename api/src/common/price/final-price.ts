import type { Prisma } from '../../generated/prisma/client.js';

// The price after the discount, rounded down to whole rubles (spec 0004 E8, AC5): 1999.99 with
// discount 15 gives 1699. Computed in Decimal so no binary fraction shifts the floor.
export function finalPrice(price: Prisma.Decimal, discount: number): number {
  return price
    .mul(100 - discount)
    .div(100)
    .floor()
    .toNumber();
}
