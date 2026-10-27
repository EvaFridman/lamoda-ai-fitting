import type { SafetyRefusal } from '../ai/safety-category.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { FittingFailure, GenerationStatus } from '../generated/prisma/enums.js';
import { generationResultKey } from '../storage/keys.js';
import { quotaMonth } from './quota-month.js';

// The statuses of a generation that has not ended: the workflow moves the row out of them once.
export const RUNNING_STATUSES = ['pending', 'processing'] as const satisfies GenerationStatus[];

// How a fitting ended, as `endFitting` writes it. Only codes and OpenAI's request id: no input of
// the user goes through the workflow's history. `keepUnit`: a cancelled fitting stays spent
// (A47), since the paid call may have been made. `safety`: a moderation refusal's stage and
// category (spec 0023 plan §3.5), only with `failureCode` `moderation` (the table's CHECK).
export type FittingOutcome =
  | { status: 'completed'; providerRequestId: string | null }
  | {
      status: 'failed';
      failureCode: FittingFailure;
      errorMessage: string | null;
      providerRequestId: string | null;
      keepUnit?: boolean;
      safety?: SafetyRefusal;
    };

// Ends a fitting (plan §4, A20): moves the row out of `pending`/`processing` with a conditional
// update and, only when that update changed it, in the same transaction takes the unit back for a
// failed fitting that counted (a free regeneration's: its parent's flag, A70). A repeat (a retry
// after a lost answer) or a row that is gone (a cancelled fitting keeps its unit, A47) changes
// nothing. The workflow's `complete` and a failed start of the workflow (FittingsService) end a
// fitting here. A transient photo stays for a regeneration while the try-on is open; the
// housekeeping deletes it (A69).
// `from` narrows the statuses it ends (a failed start ends only a `pending` row); `claimed` ends
// only a row whose paid call was never claimed (`'never'`: `started_at` NULL, A67) or was claimed
// before a time, in the same conditional update, so a claim between a read and this cannot slip
// through.
export async function endFitting(
  prisma: PrismaClient,
  generationId: string,
  outcome: FittingOutcome,
  {
    from = RUNNING_STATUSES,
    claimed,
  }: { from?: readonly GenerationStatus[]; claimed?: 'never' | { before: Date } } = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.aiGeneration.findUnique({
      where: { id: generationId },
      select: { userId: true, countsAgainstLimit: true, createdAt: true, parentId: true },
    });
    if (row?.userId == null) {
      return;
    }
    const { userId } = row;
    // A failure gives the unit back unless it is to stay spent.
    const refund = outcome.status === 'failed' && outcome.keepUnit !== true;
    const changed = await tx.aiGeneration.updateMany({
      where: {
        id: generationId,
        status: { in: [...from] },
        ...(claimed === undefined
          ? {}
          : { startedAt: claimed === 'never' ? null : { lt: claimed.before } }),
      },
      data: {
        status: outcome.status,
        finishedAt: new Date(),
        providerRequestId: outcome.providerRequestId,
        ...(outcome.status === 'failed'
          ? {
              failureCode: outcome.failureCode,
              errorMessage: outcome.errorMessage,
              ...(outcome.failureCode === 'moderation' && outcome.safety !== undefined
                ? {
                    failureStage: outcome.safety.stage,
                    failureCategory: outcome.safety.category,
                  }
                : {}),
              ...(refund ? { countsAgainstLimit: false } : {}),
            }
          : { resultImageKey: generationResultKey(userId, generationId) }),
      },
    });
    if (changed.count === 0 || !refund) {
      return;
    }
    if (row.countsAgainstLimit) {
      await tx.fittingQuota.updateMany({
        where: { userId, month: quotaMonth(row.createdAt), used: { gt: 0 } },
        data: { used: { decrement: 1 } },
      });
    } else if (row.parentId !== null) {
      // A free regeneration (A6) gives its parent's free one back (A70); a parent deleted
      // meanwhile has nothing to give it to.
      await tx.aiGeneration.updateMany({
        where: { id: row.parentId, userId },
        data: { freeRegenerationUsed: false },
      });
    }
  });
}
