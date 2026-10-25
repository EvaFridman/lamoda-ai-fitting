import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';

import { AiProviderError } from '../ai/ai-provider.error.js';
import { AI_PROVIDER, type AiProvider } from '../ai/ai-provider.js';
import { AI_SETTINGS, type AiSettings } from '../ai/ai-settings.js';
import {
  AppException,
  type ErrorDetail,
  NotFoundError,
  ValidationError,
} from '../common/errors/app.exception.js';
import { toMediaUrl } from '../common/media/media-url.js';
import type { CursorPaginated } from '../common/pagination/cursor-paginated.js';
import { decimalToNumber } from '../common/price/decimal.js';
import { finalPrice } from '../common/price/final-price.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OutfitSlot } from '../generated/prisma/enums.js';
import { lockUser } from '../me/lock-user.js';
import { userGone } from '../me/me.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COLOUR_VALUE } from '../products/colour.js';
import { IMAGE_ORDER } from '../products/product-mapper.js';
import { generationFolder } from '../storage/keys.js';
import { ownedLink } from '../storage/owner-check.js';
import { StorageService } from '../storage/storage.service.js';
import { FileDeletion } from '../temporal/file-deletion.js';
import { fittingWorkflowId } from '../temporal/fitting-workflow-id.js';
import { WorkflowStarter } from '../temporal/workflow-starter.js';
import type { GenerateFittingInput } from '../temporal/workflows/generate-fitting.workflow.js';
import type { FittingListQueryDto } from './dto/fitting-list-query.dto.js';
import type { FittingDto, FittingStage, StartedFittingDto } from './dto/fitting.dto.js';
import type { RegenerateFittingDto } from './dto/regenerate-fitting.dto.js';
import type { StartFittingDto } from './dto/start-fitting.dto.js';
import { endFitting, RUNNING_STATUSES } from './end-fitting.js';
import { decodeFittingCursor, encodeFittingCursor } from './fitting-cursor.js';
import { FittingQuotaService } from './fitting-quota.service.js';
import { fittingFingerprint } from './fingerprint.js';

// Newest first, the id keeps the order fixed (spec 0004 E51).
const ORDER: Prisma.AiGenerationOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

// The items as the catalog has them now (plan §5), in the order the model got them (by product
// id, A68).
const FOR_RESPONSE = {
  products: {
    orderBy: { productId: 'asc' },
    select: {
      productId: true,
      attributeValueId: true,
      attributeValue: { select: { value: true } },
      product: {
        select: {
          name: true,
          price: true,
          discount: true,
          brand: { select: { name: true } },
          images: { orderBy: IMAGE_ORDER, take: 1, select: { imageKey: true } },
        },
      },
    },
  },
} satisfies Prisma.AiGenerationInclude;

type Row = Prisma.AiGenerationGetPayload<{ include: typeof FOR_RESPONSE }>;

// The fittings of a user: `kind` is set on every fitting, NULL on the closed route's rows (A65).
function fittingsOf(userId: string): Prisma.AiGenerationWhereInput {
  return { userId, kind: { not: null } };
}

// A27: the median of the user's last completed fittings, from the start to the result, and the
// guess before any.
const ESTIMATE_SAMPLE = 10;
const DEFAULT_ESTIMATE_SECONDS = 25;

// What a start answers: the row, and whether this request made it (201) or found it (200).
export interface StartResult {
  fitting: StartedFittingDto;
  created: boolean;
}

interface ItemRow {
  productId: string;
  attributeValueId: string | null;
  slot: OutfitSlot;
}

// The text check did not answer (A45): its deadline passed, or OpenAI is down or refused the
// call. A 503 with nothing stored, so the user retries; AppExceptionFilter reports it as an
// outage (once per route and minute).
export class TextCheckUnavailableError extends AppException {
  constructor(cause: AiProviderError) {
    super(
      'SERVICE_UNAVAILABLE',
      cause.isTimeout
        ? 'The text check did not answer in time, try again'
        : 'The text check is unavailable, try again later',
    );
    this.cause = cause;
  }
}

// The try-ons of the signed-in user (spec 0019 plan §5): a start spends one try-on of the month
// (A20) in one transaction with the user's row locked, then the workflow `generateFitting` makes
// the picture (plan §4); reads and deletes see only the user's own fittings, someone else's is
// 404 (spec 0013 N8). No route waits for the model: a start answers with the pending row.
@Injectable()
export class FittingsService {
  private readonly logger = new Logger(FittingsService.name);
  private readonly mediaBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fileDeletion: FileDeletion,
    private readonly starter: WorkflowStarter,
    private readonly quota: FittingQuotaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
    config: ConfigService<Env, true>,
  ) {
    this.mediaBaseUrl = config.get('MEDIA_BASE_URL', { infer: true });
  }

  // In this order, so a refused start costs as little as it can: the user, the items and the
  // photo (reads), the repeat (A7), a running duplicate (A32) and the limit (a read: a user at the
  // limit pays for no check) before the paid text check (A16, A45), then the start transaction: the user's row locked, the running duplicate looked up
  // again (two parallel requests: the second answers the first's row), the photo read again (the
  // housekeeping may have deleted a one-time photo, A69), one try-on reserved (A20), the active
  // session (A23) and the row. The workflow starts after the commit.
  async start(userId: string, dto: StartFittingDto): Promise<StartResult> {
    await this.assertUser(userId);
    const items = await this.checkItems(dto);
    await this.assertPhoto(this.prisma, userId, dto.photoId);
    const promptText = dto.promptText ?? null;
    const fingerprint = fittingFingerprint({ photoId: dto.photoId, items, promptText });
    const repeat = await this.prisma.aiGeneration.findFirst({
      where: { ...fittingsOf(userId), fingerprint, status: 'completed' },
      orderBy: ORDER,
      include: FOR_RESPONSE,
    });
    if (repeat !== null) {
      return { fitting: await this.toStarted(repeat, true), created: false };
    }
    const running = await this.findRunning(this.prisma, userId, fingerprint);
    if (running !== null) {
      return { fitting: await this.toStarted(running, false), created: false };
    }
    await this.quota.assertLeft(userId);
    if (promptText !== null) {
      await this.checkText(promptText, 'promptText');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const again = await this.findRunning(tx, userId, fingerprint);
      if (again !== null) {
        return { row: again, created: false };
      }
      await this.assertPhoto(tx, userId, dto.photoId);
      const createdAt = new Date();
      await this.quota.reserve(tx, userId, createdAt);
      const row = await tx.aiGeneration.create({
        data: {
          ...(await this.newRow(tx, userId, createdAt)),
          kind: dto.kind,
          photoId: dto.photoId,
          promptText,
          fingerprint,
          products: { createMany: { data: items } },
        },
        include: FOR_RESPONSE,
      });
      return { row, created: true };
    });
    return this.launched(result);
  }

  // A new result from a completed one (spec 0019 plan §5, A6, A16, A70): its photo, items and
  // wishes with the reasons and a comment. The first regeneration of a try-on's result is free
  // (its `free_regeneration_used` set in the transaction); the next ones, and every regeneration
  // of a regeneration, spend a try-on (A70). A paid one is refused at the limit before the paid
  // text check, as a start is. Its
  // fingerprint is its parent's, so a second regeneration while the first runs answers the
  // running one (A32). A result not completed is 409 NOT_COMPLETED, one whose photo is gone 409
  // PHOTO_GONE; someone else's or a missing one 404.
  async regenerate(userId: string, id: string, dto: RegenerateFittingDto): Promise<StartResult> {
    await this.assertUser(userId);
    const parent = await this.prisma.aiGeneration.findFirst({
      where: { ...fittingsOf(userId), id },
      select: { status: true, photoId: true, fingerprint: true, freeRegenerationUsed: true },
    });
    const { fingerprint } = checkParent(parent);
    const running = await this.findRunning(this.prisma, userId, fingerprint);
    if (running !== null) {
      return { fitting: await this.toStarted(running, false), created: false };
    }
    if (parent?.freeRegenerationUsed !== false) {
      await this.quota.assertLeft(userId);
    }
    const comment = dto.comment ?? null;
    if (comment !== null) {
      await this.checkText(comment, 'comment');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const again = await this.findRunning(tx, userId, fingerprint);
      if (again !== null) {
        return { row: again, created: false };
      }
      // Read again under the lock: deleted, or its photo deleted, meanwhile.
      const stored = await tx.aiGeneration.findFirst({
        where: { ...fittingsOf(userId), id },
        select: {
          status: true,
          photoId: true,
          fingerprint: true,
          kind: true,
          promptText: true,
          products: { select: { productId: true, attributeValueId: true, slot: true } },
        },
      });
      const kept = checkParent(stored);
      const free = await tx.aiGeneration.updateMany({
        where: { id, userId, freeRegenerationUsed: false },
        data: { freeRegenerationUsed: true },
      });
      const createdAt = new Date();
      if (free.count === 0) {
        await this.quota.reserve(tx, userId, createdAt);
      }
      const row = await tx.aiGeneration.create({
        data: {
          ...(await this.newRow(tx, userId, createdAt)),
          kind: kept.kind,
          photoId: kept.photoId,
          parentId: id,
          promptText: kept.promptText,
          comment,
          regenerationReasons: dto.reasons,
          fingerprint: kept.fingerprint,
          countsAgainstLimit: free.count === 0,
          // Only a try-on's own result has a free regeneration (A70): this one's spend a try-on.
          freeRegenerationUsed: true,
          products: { createMany: { data: kept.products } },
        },
        include: FOR_RESPONSE,
      });
      return { row, created: true };
    });
    return this.launched(result);
  }

  // The history, newest first, paged by cursor (plan §5); the total only for the first batch.
  async list(userId: string, query: FittingListQueryDto): Promise<CursorPaginated<FittingDto>> {
    const where: Prisma.AiGenerationWhereInput = {
      ...fittingsOf(userId),
      ...(query.kind === undefined ? {} : { kind: query.kind }),
    };
    const cursor = query.cursor === undefined ? null : decodeFittingCursor(query.cursor);
    const page: Prisma.AiGenerationWhereInput =
      cursor === null
        ? where
        : {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ],
          };
    const rows = await this.prisma.aiGeneration.findMany({
      where: page,
      include: FOR_RESPONSE,
      orderBy: ORDER,
      take: query.limit + 1,
    });
    const batch = rows.slice(0, query.limit);
    const last = batch.at(-1);
    const total = cursor === null ? await this.prisma.aiGeneration.count({ where }) : null;
    const estimate = batch.some((row) => isRunning(row.status))
      ? await this.estimateSeconds(userId)
      : null;
    return {
      items: await Promise.all(batch.map((row) => this.toResponse(row, estimate))),
      total,
      nextCursor:
        rows.length > query.limit && last !== undefined ? encodeFittingCursor(last) : null,
    };
  }

  async get(userId: string, id: string): Promise<FittingDto> {
    const row = await this.prisma.aiGeneration.findFirst({
      where: { ...fittingsOf(userId), id },
      include: FOR_RESPONSE,
    });
    if (row === null) {
      throw new NotFoundError('Fitting not found');
    }
    return this.toResponse(row, isRunning(row.status) ? await this.estimateSeconds(userId) : null);
  }

  // «Вы это примеряли» (AC24): the newest completed fitting that holds the product, regenerations
  // included (A7). A product never tried on, or a missing one, is 404.
  async lastOfProduct(userId: string, productId: string): Promise<FittingDto> {
    const row = await this.prisma.aiGeneration.findFirst({
      where: { ...fittingsOf(userId), status: 'completed', products: { some: { productId } } },
      include: FOR_RESPONSE,
      orderBy: ORDER,
    });
    if (row === null) {
      throw new NotFoundError('Fitting not found');
    }
    return this.toResponse(row, null);
  }

  // A hard delete (A25): the row and its outbox entry in one transaction, the files after the
  // commit; the spent try-on stays spent (A20). A running one is cancelled after its row is gone
  // (A47, A68): its workflow then discards a written result and changes nothing, so it stays
  // spent too. A failed cancel is logged: the workflow finds no row and ends by itself. Someone
  // else's or a missing fitting is 404 (P2025).
  async delete(userId: string, id: string): Promise<void> {
    const { status, queued } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.aiGeneration.delete({
        where: { id, userId, kind: { not: null } },
        select: { status: true },
      });
      const deletion = await this.fileDeletion.enqueue(tx, 'generation', id, [
        generationFolder(userId, id),
      ]);
      return { status: row.status, queued: deletion };
    });
    // Side by side, so a Temporal outage costs the request START_TIMEOUT_MS once, not twice (spec
    // 0011 M26): the delete still answers 204 within REQUEST_TIMEOUT_MS. Neither throws.
    await Promise.all([
      this.fileDeletion.start(queued),
      isRunning(status) ? this.cancel(id) : Promise.resolve(),
    ]);
  }

  private async cancel(id: string): Promise<void> {
    try {
      await this.starter.cancel(fittingWorkflowId(id));
    } catch (error) {
      this.logger.warn({
        msg: 'Could not cancel a deleted fitting; its workflow ends when it finds no row',
        err: error,
        id,
      });
    }
  }

  // A deleted user's cached session may still pass for 5 minutes (spec 0013 N31): 401 here,
  // before a paid check; the lock in the transaction is the final word.
  private async assertUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user === null) {
      throw userGone();
    }
  }

  // The user's photo, saved or one-time (A24): missing, deleted or someone else's is
  // RELATED_NOT_FOUND on `photoId`.
  private async assertPhoto(
    client: Prisma.TransactionClient,
    userId: string,
    photoId: string,
  ): Promise<void> {
    const photo = await client.userPhoto.findUnique({
      where: { id: photoId, userId },
      select: { id: true },
    });
    if (photo === null) {
      throw relatedNotFound([
        { field: 'photoId', code: 'RELATED_NOT_FOUND', message: 'photoId names no photo of yours' },
      ]);
    }
  }

  // The products exist and each colour is one of its product's colours, a value of its colour
  // attribute (RELATED_NOT_FOUND, A76, A91: a season or a material is no colour); each category
  // has a slot (HAS_SLOT) and a look's slots differ (DISTINCT_SLOTS, A18, A70). A regeneration
  // copies its parent's items unchecked: a parent from before this rule keeps its value.
  private async checkItems(dto: StartFittingDto): Promise<ItemRow[]> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map((item) => item.productId) } },
      select: {
        id: true,
        category: { select: { slot: true } },
        attributeValues: {
          where: { attributeValue: COLOUR_VALUE },
          select: { attributeValueId: true },
        },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const missing: ErrorDetail[] = [];
    dto.items.forEach((item, index) => {
      const product = byId.get(item.productId);
      if (product === undefined) {
        missing.push({
          field: `items.${index}.productId`,
          code: 'RELATED_NOT_FOUND',
          message: `items.${index}.productId names no product`,
        });
      } else if (
        item.attributeValueId !== undefined &&
        !product.attributeValues.some((link) => link.attributeValueId === item.attributeValueId)
      ) {
        missing.push({
          field: `items.${index}.attributeValueId`,
          code: 'RELATED_NOT_FOUND',
          message: `items.${index}.attributeValueId is not a colour of its product`,
        });
      }
    });
    if (missing.length > 0) {
      throw relatedNotFound(missing);
    }
    const slots: ErrorDetail[] = [];
    const taken = new Set<OutfitSlot>();
    const items = dto.items.map((item, index): ItemRow | null => {
      const slot = byId.get(item.productId)?.category.slot ?? null;
      const field = `items.${index}.productId`;
      if (slot === null) {
        slots.push({ field, code: 'HAS_SLOT', message: `${field}'s category takes no try-on` });
        return null;
      }
      if (dto.kind === 'look' && taken.has(slot)) {
        slots.push({ field, code: 'DISTINCT_SLOTS', message: `${field} repeats the slot ${slot}` });
      }
      taken.add(slot);
      return { productId: item.productId, attributeValueId: item.attributeValueId ?? null, slot };
    });
    if (slots.length > 0) {
      throw new ValidationError(slots);
    }
    return items.filter((item): item is ItemRow => item !== null);
  }

  // The text check (A16, A45): refused is 400 PROMPT_REFUSED with the reason's code in the
  // message, spending nothing; one that does not answer is 503 with nothing stored.
  private async checkText(text: string, field: 'promptText' | 'comment'): Promise<void> {
    let check;
    try {
      check = await this.ai.checkPrompt(text);
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw new TextCheckUnavailableError(error);
      }
      throw error;
    }
    if (!check.allowed) {
      throw new AppException('PROMPT_REFUSED', `${field} was refused: ${check.reason}`);
    }
  }

  // The user's running fitting of this fingerprint (A32), one at most by the partial unique index.
  private findRunning(
    client: Prisma.TransactionClient,
    userId: string,
    fingerprint: string,
  ): Promise<Row | null> {
    return client.aiGeneration.findFirst({
      where: { userId, fingerprint, status: { in: [...RUNNING_STATUSES] } },
      include: FOR_RESPONSE,
    });
  }

  // The columns every new fitting shares: its user, the active session (created at the first
  // try-on, A21, A23; the user's lock serialises it), the provider and model, `pending`.
  private async newRow(
    tx: Prisma.TransactionClient,
    userId: string,
    createdAt: Date,
  ): Promise<Prisma.AiGenerationUncheckedCreateInput> {
    const session =
      (await tx.fittingSession.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      })) ?? (await tx.fittingSession.create({ data: { userId }, select: { id: true } }));
    return {
      userId,
      sessionId: session.id,
      createdAt,
      status: 'pending',
      aiProvider: this.ai.name,
      aiModel: this.ai.model,
    };
  }

  // After the commit (plan §4): a new row starts its workflow. A start that fails ends the row
  // `failed` `provider_error` with its try-on given back (endFitting), logged and sent to Sentry
  // with the id only; the answer then shows the failed fitting, so the user starts it again.
  private async launched({ row, created }: { row: Row; created: boolean }): Promise<StartResult> {
    if (!created) {
      return { fitting: await this.toStarted(row, false), created };
    }
    try {
      await this.starter.start<(input: GenerateFittingInput) => Promise<void>>('generateFitting', {
        workflowId: fittingWorkflowId(row.id),
        args: [{ generationId: row.id, timeoutSeconds: this.settings.timeoutSeconds }],
      });
    } catch (error) {
      return { fitting: await this.toStarted(await this.notStarted(row, error), false), created };
    }
    return { fitting: await this.toStarted(row, false), created };
  }

  // Ends a row whose workflow did not start and reads it back; a row deleted meanwhile answers as
  // it was committed. Only while `pending` (an hour later the housekeeping would, A70): a start
  // that timed out on our side may have reached Temporal, and a row its worker already took
  // (`processing`, maybe paid, A67) is the workflow's to end.
  private async notStarted(row: Row, error: unknown): Promise<Row> {
    this.logger.error({
      msg: 'Could not start a fitting; it ended as failed',
      err: error,
      id: row.id,
    });
    Sentry.captureException(new Error('A fitting workflow did not start'), {
      extra: { generationId: row.id },
    });
    await endFitting(
      this.prisma,
      row.id,
      {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'workflow_not_started',
        providerRequestId: null,
      },
      { from: ['pending'] },
    );
    return (
      (await this.prisma.aiGeneration.findUnique({
        where: { id: row.id },
        include: FOR_RESPONSE,
      })) ?? row
    );
  }

  // A27: seconds from the start to the result over the user's last completed fittings.
  private async estimateSeconds(userId: string): Promise<number> {
    const rows = await this.prisma.aiGeneration.findMany({
      where: { ...fittingsOf(userId), status: 'completed', finishedAt: { not: null } },
      orderBy: ORDER,
      take: ESTIMATE_SAMPLE,
      select: { createdAt: true, finishedAt: true },
    });
    const durations = rows
      .map((row) => ((row.finishedAt?.getTime() ?? 0) - row.createdAt.getTime()) / 1000)
      .filter((seconds) => seconds > 0)
      .sort((a, b) => a - b);
    if (durations.length === 0) {
      return DEFAULT_ESTIMATE_SECONDS;
    }
    const middle = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 1
        ? (durations[middle] ?? 0)
        : ((durations[middle - 1] ?? 0) + (durations[middle] ?? 0)) / 2;
    return Math.max(1, Math.round(median));
  }

  private async toStarted(row: Row, repeated: boolean): Promise<StartedFittingDto> {
    const estimate = isRunning(row.status) ? await this.estimateSeconds(row.userId ?? '') : null;
    return { ...(await this.toResponse(row, estimate)), repeated };
  }

  private async toResponse(row: Row, estimate: number | null): Promise<FittingDto> {
    return {
      id: row.id,
      // Every fitting has one (fittingsOf); the closed route's rows read as `single`.
      kind: row.kind ?? 'single',
      parentId: row.parentId,
      status: row.status,
      stage: stageOf(row.status),
      failureCode: row.failureCode,
      countsAgainstLimit: row.countsAgainstLimit,
      regenerationFree:
        row.status === 'completed' && !row.freeRegenerationUsed && row.photoId !== null,
      model: row.aiModel,
      items: row.products.map(({ productId, attributeValueId, attributeValue, product }) => {
        const image = product.images[0];
        return {
          productId,
          name: product.name,
          brand: product.brand.name,
          imageUrl: image === undefined ? null : toMediaUrl(this.mediaBaseUrl, image.imageKey),
          price: decimalToNumber(product.price),
          finalPrice: finalPrice(product.price, product.discount),
          attributeValueId,
          colour: attributeValue?.value ?? null,
        };
      }),
      photoId: row.photoId,
      resultUrl:
        row.userId === null
          ? null
          : await ownedLink(this.storage, this.logger, {
              rowId: row.id,
              field: 'resultImageKey',
              key: row.resultImageKey,
              ownerId: row.userId,
            }),
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      estimatedSeconds: isRunning(row.status) ? estimate : null,
    };
  }
}

function isRunning(status: Row['status']): boolean {
  return (RUNNING_STATUSES as readonly string[]).includes(status);
}

function stageOf(status: Row['status']): FittingStage {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'generating';
    case 'completed':
    case 'failed':
      return 'done';
  }
}

// A result to regenerate (A70): missing is 404, not completed 409 NOT_COMPLETED, its photo gone
// 409 PHOTO_GONE. Returns it with its photo and its fingerprint, which a completed fitting always
// has.
function checkParent<
  Parent extends { status: Row['status']; photoId: string | null; fingerprint: string | null },
>(parent: Parent | null): Parent & { photoId: string; fingerprint: string } {
  if (parent === null) {
    throw new NotFoundError('Fitting not found');
  }
  if (parent.status !== 'completed') {
    throw new AppException('NOT_COMPLETED', 'Only a completed fitting can be regenerated');
  }
  const { photoId, fingerprint } = parent;
  if (photoId === null || fingerprint === null) {
    throw photoGone();
  }
  return { ...parent, photoId, fingerprint };
}

function photoGone(): AppException {
  return new AppException(
    'PHOTO_GONE',
    "The fitting's photo was deleted; start a new fitting with another photo",
  );
}

function relatedNotFound(details: ErrorDetail[]): AppException {
  return new AppException('RELATED_NOT_FOUND', 'A referenced record does not exist', details);
}
