import { Injectable } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
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

const WITH_PRODUCTS = {
  products: { select: { productId: true }, orderBy: { productId: 'asc' } },
} satisfies Prisma.AiGenerationInclude;

type Row = Prisma.AiGenerationGetPayload<{ include: typeof WITH_PRODUCTS }>;

function toResponse({ products, ...generation }: Row): AiGenerationResponseDto {
  return { ...generation, productIds: products.map((link) => link.productId) };
}

function assertTriple(triple: GenerationTriple): void {
  const details = checkGenerationTriple(triple);
  if (details.length > 0) {
    throw new ValidationError(details);
  }
}

// Records generations; nothing here starts an AI workflow (spec 0004 E12). The triple is checked
// before any write (AC9); an update checks the stored row with the body merged in, and the links
// are replaced in the same transaction. The triple is read before the row lock, so two parallel
// updates can still break it together; the database check catches that (E55). A missing session or product is P2003, 400
// RELATED_NOT_FOUND; a missing generation 404. Deleting a generation removes its links (cascade).
@Injectable()
export class AiGenerationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AiGenerationListQueryDto): Promise<Paginated<AiGenerationResponseDto>> {
    const where: Prisma.AiGenerationWhereInput = { sessionId: query.sessionId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiGeneration.findMany({
        where,
        include: WITH_PRODUCTS,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.aiGeneration.count({ where }),
    ]);
    return { items: rows.map(toResponse), total };
  }

  async get(id: string): Promise<AiGenerationResponseDto> {
    const row = await this.prisma.aiGeneration.findUnique({
      where: { id },
      include: WITH_PRODUCTS,
    });
    if (row === null) {
      throw new NotFoundError('AI generation not found');
    }
    return toResponse(row);
  }

  // `null` or left out, the result and the error are none.
  async create(dto: CreateAiGenerationDto): Promise<AiGenerationResponseDto> {
    const { productIds, resultImageKey = null, errorMessage = null, ...fields } = dto;
    assertTriple({ status: dto.status, resultImageKey, errorMessage });
    const row = await this.prisma.aiGeneration.create({
      data: {
        ...fields,
        resultImageKey,
        errorMessage,
        products: { createMany: { data: productIds.map((productId) => ({ productId })) } },
      },
      include: WITH_PRODUCTS,
    });
    return toResponse(row);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40). Statements of the
  // transaction run in turn, never in Promise.all (backlog "pg 9 and Prisma transactions").
  async update(id: string, dto: UpdateAiGenerationDto): Promise<AiGenerationResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    const { productIds, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.aiGeneration.findUnique({
        where: { id },
        select: { status: true, resultImageKey: true, errorMessage: true },
      });
      if (stored === null) {
        throw new NotFoundError('AI generation not found');
      }
      assertTriple({
        status: fields.status ?? stored.status,
        resultImageKey:
          fields.resultImageKey === undefined ? stored.resultImageKey : fields.resultImageKey,
        errorMessage: fields.errorMessage === undefined ? stored.errorMessage : fields.errorMessage,
      });
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
      return toResponse(
        await tx.aiGeneration.findUniqueOrThrow({ where: { id }, include: WITH_PRODUCTS }),
      );
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.aiGeneration.delete({ where: { id } });
  }
}
