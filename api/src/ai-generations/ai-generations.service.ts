import { Injectable, Logger } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generationFolder } from '../storage/keys.js';
import { ownedLink, ownerFolderDetails } from '../storage/owner-check.js';
import { StorageService } from '../storage/storage.service.js';
import { FileDeletion } from '../temporal/file-deletion.js';
import type { AiGenerationListQueryDto } from './dto/ai-generation-list-query.dto.js';
import type { AiGenerationResponseDto } from './dto/ai-generation-response.dto.js';
import type { CreateAiGenerationDto } from './dto/create-ai-generation.dto.js';
import type { UpdateAiGenerationDto } from './dto/update-ai-generation.dto.js';
import { checkGenerationTriple, type GenerationTriple } from './generation-triple.js';

// Newest first, the id keeps the order fixed (spec 0004 E51).
const ORDER: Prisma.AiGenerationOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

// The product ids, and the session's user, who owns the images (spec 0011 M25).
const FOR_RESPONSE = {
  products: { select: { productId: true }, orderBy: { productId: 'asc' } },
  session: { select: { userId: true } },
} satisfies Prisma.AiGenerationInclude;

type Row = Prisma.AiGenerationGetPayload<{ include: typeof FOR_RESPONSE }>;

type ImageKeys = Record<'userImageKey' | 'resultImageKey', string | null | undefined>;

// The triple and the keys written (spec 0011 M8) are refused together, in one 400.
function assertWrite(triple: GenerationTriple, keys: ImageKeys, ownerId: string | null): void {
  const details = [
    ...checkGenerationTriple(triple),
    ...(ownerId === null ? [] : ownerFolderDetails(keys, ownerId)),
  ];
  if (details.length > 0) {
    throw new ValidationError(details);
  }
}

// Reads and deletion take the signed-in user's id and see only the generations of that user's
// sessions: someone else's is 404, as one that does not exist (spec 0013 N8, AC8); the closed
// writes (the generation workflow's) see every row.
// Records generations; nothing here starts an AI workflow (spec 0004 E12). The triple is checked
// before any write (AC9); an update checks the stored row with the body merged in, and the links
// are replaced in the same transaction. The triple is read before the row lock, so two parallel
// updates can still break it together; the database check catches that (E55). A missing session or product is P2003, 400
// RELATED_NOT_FOUND; a missing generation 404. Deleting a generation removes its links (cascade)
// and then its files (spec 0011 M11).
// The image keys written must lie in the folder of the session's user (spec 0011 M8); responses
// carry signed links to them (M9), only for keys in that folder (M25).
@Injectable()
export class AiGenerationsService {
  private readonly logger = new Logger(AiGenerationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fileDeletion: FileDeletion,
  ) {}

  // `sessionId` of someone else's session lists nothing.
  async list(
    userId: string,
    query: AiGenerationListQueryDto,
  ): Promise<Paginated<AiGenerationResponseDto>> {
    const where: Prisma.AiGenerationWhereInput = {
      sessionId: query.sessionId,
      session: { userId },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiGeneration.findMany({
        where,
        include: FOR_RESPONSE,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.aiGeneration.count({ where }),
    ]);
    return { items: await Promise.all(rows.map((row) => this.toResponse(row))), total };
  }

  get(userId: string, id: string): Promise<AiGenerationResponseDto> {
    return this.find({ id, session: { userId } });
  }

  private async find(where: Prisma.AiGenerationWhereUniqueInput): Promise<AiGenerationResponseDto> {
    const row = await this.prisma.aiGeneration.findUnique({ where, include: FOR_RESPONSE });
    if (row === null) {
      throw new NotFoundError('AI generation not found');
    }
    return this.toResponse(row);
  }

  // `null` or left out, the result and the error are none. A missing session skips the owner
  // check, so the create answers 400 RELATED_NOT_FOUND on `sessionId` as before (spec 0004 E52).
  async create(dto: CreateAiGenerationDto): Promise<AiGenerationResponseDto> {
    const { productIds, resultImageKey = null, errorMessage = null, ...fields } = dto;
    const session = await this.prisma.fittingSession.findUnique({
      where: { id: dto.sessionId },
      select: { userId: true },
    });
    assertWrite(
      { status: dto.status, resultImageKey, errorMessage },
      { userImageKey: dto.userImageKey, resultImageKey },
      session?.userId ?? null,
    );
    const row = await this.prisma.aiGeneration.create({
      data: {
        ...fields,
        // The session's user (spec 0019 A23), so the column can become NOT NULL a release later.
        userId: session?.userId,
        resultImageKey,
        errorMessage,
        products: { createMany: { data: productIds.map((productId) => ({ productId })) } },
      },
      include: FOR_RESPONSE,
    });
    return this.toResponse(row);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40). Statements of the
  // transaction run in turn, never in Promise.all (backlog "pg 9 and Prisma transactions").
  async update(id: string, dto: UpdateAiGenerationDto): Promise<AiGenerationResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.find({ id });
    }
    const { productIds, ...fields } = dto;
    // Signed after the transaction: it holds the row lock until it ends.
    const row = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.aiGeneration.findUnique({
        where: { id },
        select: {
          status: true,
          resultImageKey: true,
          errorMessage: true,
          failureCode: true,
          session: { select: { userId: true } },
        },
      });
      if (stored === null) {
        throw new NotFoundError('AI generation not found');
      }
      assertWrite(
        {
          status: fields.status ?? stored.status,
          resultImageKey:
            fields.resultImageKey === undefined ? stored.resultImageKey : fields.resultImageKey,
          errorMessage:
            fields.errorMessage === undefined ? stored.errorMessage : fields.errorMessage,
          failureCode: stored.failureCode,
        },
        { userImageKey: fields.userImageKey, resultImageKey: fields.resultImageKey },
        stored.session.userId,
      );
      // The row first: its lock makes a parallel update wait here, so that update's deleteMany
      // sees the links this one writes and removes them. Links replaced before the lock could end
      // up as both lists together. `updatedAt` is set so a body of only `productIds` still locks.
      await tx.aiGeneration.update({ where: { id }, data: { ...fields, updatedAt: new Date() } });
      if (productIds !== undefined) {
        await tx.generationProduct.deleteMany({ where: { generationId: id } });
        await tx.generationProduct.createMany({
          data: productIds.map((productId) => ({ generationId: id, productId })),
        });
      }
      return tx.aiGeneration.findUniqueOrThrow({ where: { id }, include: FOR_RESPONSE });
    });
    return this.toResponse(row);
  }

  // The files go after the row: its own folder only, so a key of it elsewhere in the owner's folder
  // (the user's photo) stays (spec 0011 M24). Someone else's generation is P2025, 404.
  async delete(userId: string, id: string): Promise<void> {
    // The row and its outbox entry in one transaction (spec 0019 A38); the files after the commit.
    const queued = await this.prisma.$transaction(async (tx) => {
      const generation = await tx.aiGeneration.delete({
        where: { id, session: { userId } },
        select: { id: true, session: { select: { userId: true } } },
      });
      return this.fileDeletion.enqueue(tx, 'generation', generation.id, [
        generationFolder(generation.session.userId, generation.id),
      ]);
    });
    await this.fileDeletion.start(queued);
  }

  // The route's own fields only: the fitting's columns (spec 0019 plan §2) belong to `/fittings`.
  private async toResponse({
    products,
    session,
    ...generation
  }: Row): Promise<AiGenerationResponseDto> {
    const link = (field: 'userImageKey' | 'resultImageKey') =>
      ownedLink(this.storage, this.logger, {
        rowId: generation.id,
        field,
        key: generation[field],
        ownerId: session.userId,
      });
    const [userImageUrl, resultImageUrl] = await Promise.all([
      link('userImageKey'),
      link('resultImageKey'),
    ]);
    return {
      id: generation.id,
      sessionId: generation.sessionId,
      productIds: products.map((link) => link.productId),
      userImageKey: generation.userImageKey,
      userImageUrl,
      resultImageKey: generation.resultImageKey,
      resultImageUrl,
      status: generation.status,
      aiProvider: generation.aiProvider,
      aiModel: generation.aiModel,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt,
    };
  }
}
