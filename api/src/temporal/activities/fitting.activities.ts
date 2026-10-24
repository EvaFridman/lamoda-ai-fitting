import { ApplicationFailure, Context } from '@temporalio/activity';
import sharp from 'sharp';

import { AiProviderError } from '../../ai/ai-provider.error.js';
import type { AiProvider } from '../../ai/ai-provider.js';
import { GPT_IMAGE_SIZE } from '../../ai/image-models/gpt-image-2.js';
import type { FittingItem, FittingJob } from '../../ai/image-models/image-model.js';
import type { ImageInput } from '../../ai/image-input.js';
import { REGENERATION_REASONS, type RegenerationReason } from '../../ai/prompts.js';
import { endFitting, type FittingOutcome, RUNNING_STATUSES } from '../../fittings/end-fitting.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { FittingFailure, GenerationStatus } from '../../generated/prisma/enums.js';
import {
  generationFolder,
  generationResultKey,
  isInUserFolder,
  mediaKey,
} from '../../storage/keys.js';
import { StorageError } from '../../storage/storage.error.js';
import type { StorageService } from '../../storage/storage.service.js';

export type FittingActivities = ReturnType<typeof createFittingActivities>;

export { type FittingOutcome, RUNNING_STATUSES } from '../../fittings/end-fitting.js';

// How often a waiting activity heartbeats (A28, A39): the workflow's heartbeat timeout is three
// times this, so a dead worker is noticed within it and a cancellation reaches a paid call soon.
export const HEARTBEAT_INTERVAL_MS = 10_000;
// The result's moderation (plan §4): one call of the moderation endpoint, under the activity's
// 30 s; the client makes one attempt (`retry: false`), the activity's policy the rest.
export const MODERATION_BUDGET_MS = 20_000;
// The inputs as A29 sends them: JPEG, at most this many pixels on the longer side.
const INPUT_MAX_SIDE = 1536;
const INPUT_QUALITY = 90;
// The stored result: the model's size, WebP without metadata.
const [RESULT_WIDTH, RESULT_HEIGHT] = GPT_IMAGE_SIZE.split('x').map(Number) as [number, number];
const RESULT_QUALITY = 90;
// `error_message` holds at most this many characters (the column's 1000, C23).
const ERROR_MESSAGE_MAX = 1000;

// What `generate` gives back when the call ended with an answer: the result is in the bucket, or
// the model refused (A15). A timeout and a failure are thrown (FittingFailureType).
export type GenerateOutcome =
  | { ok: true; requestId: string | null }
  | { ok: false; failureCode: 'moderation'; requestId: string | null };

// The `type` of the ApplicationFailure a fitting's activity throws for a failure that ends it: the
// workflow writes it as the row's `failure_code`. Any other failure is `provider_error`.
export type FittingFailureType = Extract<FittingFailure, 'model_timeout' | 'provider_error'>;

// The activities of the workflow `generateFitting` (spec 0019 plan §4, A68). The workflow passes
// only the generation's id (and its user's, to discard a result after a cancellation): every
// image is read from the bucket here and the result written there, so no photo goes into
// Temporal's history and no payload nears its limit. `ai` is the worker's AI_PROVIDER, the rest
// its Nest context.
export function createFittingActivities(
  ai: AiProvider,
  storage: StorageService,
  prisma: PrismaClient,
) {
  return {
    // Moves a `pending` row to `processing` and returns its user; a repeat finds it there and
    // returns the same. A row that is gone (deleted, A47) or already ended returns null, and the
    // workflow stops.
    async markProcessing(generationId: string): Promise<{ userId: string } | null> {
      const row = await prisma.aiGeneration.findUnique({
        where: { id: generationId },
        select: { userId: true, status: true },
      });
      if (row?.userId == null || !isRunning(row.status)) {
        return null;
      }
      await prisma.aiGeneration.updateMany({
        where: { id: generationId, status: 'pending' },
        data: { status: 'processing' },
      });
      return { userId: row.userId };
    },

    // The one paid call (A28, A67): reads the photo and the items' first images from the bucket,
    // re-encodes them (A29), calls the model once, re-encodes its picture (a fixed size, no
    // metadata) and writes it to the generation's folder; `complete` sets `result_image_key` once
    // the result passed moderation. The workflow runs it once (`maximumAttempts: 1`), so every
    // failure ends the fitting: a timeout as `model_timeout`, anything else (a 5xx, a broken or
    // unreadable answer, a missing file, a failed write) as `provider_error`, both spending
    // nothing. It heartbeats every 10 s while it runs; a cancellation aborts the request in flight
    // and throws the SDK's CancelledFailure.
    async generate(generationId: string, timeoutSeconds: number): Promise<GenerateOutcome> {
      const context = Context.current();
      const signal = context.cancellationSignal;
      return withHeartbeats(context, async () => {
        try {
          // The paid call is claimed once per row (A67): `started_at` is set here and only here,
          // so a second run of the workflow (a reset by hand, a duplicate start) pays nothing.
          const claimed = await prisma.aiGeneration.updateMany({
            where: { id: generationId, status: 'processing', startedAt: null },
            data: { startedAt: new Date() },
          });
          if (claimed.count === 0) {
            throw new FittingInputError('The generation was already sent, or is gone');
          }
          const { userId, job } = await loadJob(prisma, storage, generationId, signal);
          // The deadline the workflow's time limit was built from, not this worker's own setting.
          const result = await ai.generate(job, { signal, timeoutMs: timeoutSeconds * 1000 });
          if (!result.ok) {
            return { ok: false, failureCode: 'moderation', requestId: result.requestId };
          }
          const image = await toResultImage(result.image, result.requestId);
          signal.throwIfAborted();
          await storage.put(generationResultKey(userId, generationId), image, {
            contentType: 'image/webp',
            ownerUserId: userId,
            abortSignal: signal,
          });
          return { ok: true, requestId: result.requestId };
        } catch (error) {
          if (signal.aborted) {
            throw signal.reason ?? error;
          }
          throw fittingFailure(error);
        }
      });
    },

    // The result's moderation (plan §4): flagged is a failed fitting with `moderation`. A
    // transient failure (no answer, a 429, a 5xx, the storage) is retried by the workflow's
    // policy; another one of OpenAI fails at once as `provider_error`.
    async moderate(generationId: string): Promise<{ flagged: boolean }> {
      const context = Context.current();
      const signal = context.cancellationSignal;
      return withHeartbeats(context, async () => {
        try {
          const userId = await generationUser(prisma, generationId);
          const bytes = await storage.get(generationResultKey(userId, generationId), signal);
          const { flagged } = await ai.moderateImage(
            { bytes, mimeType: 'image/webp' },
            { signal, timeoutMs: MODERATION_BUDGET_MS, retry: false },
          );
          return { flagged };
        } catch (error) {
          if (signal.aborted) {
            throw signal.reason ?? error;
          }
          if (error instanceof AiProviderError && !error.isTransient && !error.isTimeout) {
            throw fittingFailure(error);
          }
          throw error;
        }
      });
    },

    // Deletes a result that will not be shown (refused by moderation, or the fitting failed or
    // was cancelled after `generate` wrote it). `userId` comes from the workflow, since a
    // cancelled fitting's row is gone; an empty folder deletes nothing.
    async discardResult(generationId: string, userId: string): Promise<void> {
      const context = Context.current();
      // A heartbeat before each request to the storage, as deletePrefix's (A39).
      await storage.deletePrefix(
        generationFolder(userId, generationId),
        context.cancellationSignal,
        (deleted) => {
          context.heartbeat(deleted);
        },
      );
    },

    // Ends the fitting, once (endFitting): a repeat or a row that is gone changes nothing.
    async complete(generationId: string, outcome: FittingOutcome): Promise<void> {
      await endFitting(prisma, generationId, outcome);
    },
  };
}

function isRunning(status: GenerationStatus): boolean {
  return (RUNNING_STATUSES as readonly GenerationStatus[]).includes(status);
}

// Heartbeats at once and then every HEARTBEAT_INTERVAL_MS with the seconds spent, until `run`
// ends (A28): the SDK sends them at most once per 80 % of the heartbeat timeout, and a
// cancellation comes back in the answer to one.
async function withHeartbeats<T>(context: Context, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const beat = (): void => {
    context.heartbeat(Math.round((Date.now() - started) / 1000));
  };
  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
}

async function generationUser(prisma: PrismaClient, generationId: string): Promise<string> {
  const row = await prisma.aiGeneration.findUnique({
    where: { id: generationId },
    select: { userId: true },
  });
  if (row?.userId == null) {
    throw ApplicationFailure.nonRetryable('The generation is gone', 'provider_error');
  }
  return row.userId;
}

// The job of one generation from its row: the photo, the items in a fixed order (by product id)
// with their catalog names, colour and first image, and the texts. Every row holds its wishes in
// `prompt_text` (a regeneration copied its parent's) and a regeneration its comment (A70), so
// deleting an earlier result changes nothing here.
async function loadJob(
  prisma: PrismaClient,
  storage: StorageService,
  generationId: string,
  signal: AbortSignal,
): Promise<{ userId: string; job: FittingJob }> {
  const row = await prisma.aiGeneration.findUnique({
    where: { id: generationId },
    select: {
      userId: true,
      promptText: true,
      comment: true,
      regenerationReasons: true,
      photo: { select: { imageKey: true } },
      products: {
        orderBy: { productId: 'asc' },
        select: {
          attributeValue: { select: { value: true } },
          product: {
            select: {
              name: true,
              category: { select: { name: true } },
              images: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                take: 1,
                select: { imageKey: true },
              },
            },
          },
        },
      },
    },
  });
  if (row?.userId == null) {
    throw new FittingInputError('The generation is gone');
  }
  if (row.photo === null) {
    // Deleted from «Мои фото» while the fitting waited for its turn.
    throw new FittingInputError("The fitting's photo is gone");
  }
  // The owner key (A65) already ties the photo to the row's user; this keeps a later bug from
  // sending someone else's face to the model.
  if (!isInUserFolder(row.photo.imageKey, row.userId)) {
    throw new FittingInputError("The fitting's photo is not in its user's folder");
  }
  const person = await toInputImage(await storage.get(row.photo.imageKey, signal));
  const items: FittingItem[] = [];
  for (const { product, attributeValue } of row.products) {
    const image = product.images[0];
    if (image === undefined) {
      throw new FittingInputError('A product of the fitting has no image');
    }
    items.push({
      name: product.name,
      category: product.category.name,
      colour: attributeValue?.value ?? null,
      image: await toInputImage(await storage.get(mediaKey(image.imageKey), signal)),
    });
  }
  return {
    userId: row.userId,
    job: {
      person,
      items,
      wishes: row.promptText,
      comment: row.comment,
      reasons: row.regenerationReasons.filter(isRegenerationReason),
    },
  };
}

function isRegenerationReason(value: string): value is RegenerationReason {
  return (REGENERATION_REASONS as readonly string[]).includes(value);
}

// A29: JPEG, at most 1536 px on the longer side, never enlarged, no metadata.
async function toInputImage(bytes: Uint8Array): Promise<ImageInput> {
  const jpeg = await sharp(Buffer.from(bytes))
    .resize(INPUT_MAX_SIDE, INPUT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: INPUT_QUALITY })
    .toBuffer();
  return { bytes: new Uint8Array(jpeg), mimeType: 'image/jpeg' };
}

// The model's picture as it is stored. One sharp cannot read is the provider's failure (A66);
// it keeps the paid call's request id for OpenAI's support.
async function toResultImage(bytes: Uint8Array, requestId: string | null): Promise<Uint8Array> {
  try {
    const webp = await sharp(Buffer.from(bytes))
      .resize(RESULT_WIDTH, RESULT_HEIGHT, { fit: 'cover' })
      .webp({ quality: RESULT_QUALITY })
      .toBuffer();
    return new Uint8Array(webp);
  } catch {
    throw new AiProviderError('edit_image', 'http', 200, 'unreadable_image', requestId);
  }
}

// The failure that ends a fitting, with its code as the type and OpenAI's request id, if any, as
// its one detail. The message names the error's kind and code only: an AiProviderError's or a
// StorageError's message holds no input of the user, any other error gives only its name. The
// cause (its text and stack go into the history and to Sentry) is kept only for those three.
export function fittingFailure(error: unknown): ApplicationFailure {
  if (error instanceof ApplicationFailure) {
    return error;
  }
  const type: FittingFailureType =
    error instanceof AiProviderError && error.isTimeout ? 'model_timeout' : 'provider_error';
  const requestId = error instanceof AiProviderError ? error.requestId : null;
  return ApplicationFailure.create({
    message: safeMessage(error).slice(0, ERROR_MESSAGE_MAX),
    type,
    nonRetryable: true,
    details: [requestId],
    cause: isCheckedError(error) ? error : undefined,
  });
}

// An input of the fitting that is not there; its message is a fixed text.
class FittingInputError extends Error {
  override readonly name = 'FittingInputError';
}

// The errors whose text is known to hold no input of the user, no key and no path.
function isCheckedError(error: unknown): error is Error {
  return (
    error instanceof AiProviderError ||
    error instanceof StorageError ||
    error instanceof FittingInputError
  );
}

function safeMessage(error: unknown): string {
  return isCheckedError(error) ? error.message : errorName(error);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Unknown error';
}
