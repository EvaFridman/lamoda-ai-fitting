import type { Prisma } from '../generated/prisma/client.js';
import { userGone } from './me.service.js';

// Locks the signed-in user's row until the transaction ends, so the user's writes that count
// something (saved photos, the month's try-ons, a running fitting) run one at a time (spec 0019
// A20, A31, A69). A deleted user's cached session may still pass (spec 0013 N31): no row is 401.
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const owner = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  if (owner.length === 0) {
    throw userGone();
  }
}
