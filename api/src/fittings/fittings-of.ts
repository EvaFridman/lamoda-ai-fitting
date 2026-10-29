import type { Prisma } from '../generated/prisma/client.js';

// The fittings of a user: `kind` is set on every fitting, NULL on the closed route's rows (A65).
// The unseen count (spec 0024 plan §3.2) uses it too, so the partial index
// `ai_generations_unseen_idx` repeats `kind IS NOT NULL`.
export function fittingsOf(userId: string): Prisma.AiGenerationWhereInput {
  return { userId, kind: { not: null } };
}
