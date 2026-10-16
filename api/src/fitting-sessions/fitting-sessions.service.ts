import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generationFolder } from '../storage/keys.js';
import { FileDeletion } from '../temporal/file-deletion.js';
import type { CreateFittingSessionDto } from './dto/create-fitting-session.dto.js';
import type { FittingSessionListQueryDto } from './dto/fitting-session-list-query.dto.js';
import type { FittingSessionResponseDto } from './dto/fitting-session-response.dto.js';
import type { UpdateFittingSessionDto } from './dto/update-fitting-session.dto.js';

// Newest first, the id keeps the order fixed (spec 0004 E48).
const ORDER: Prisma.FittingSessionOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

// Archives the user's active session other than `exceptId`. `userId` is unique only among active
// sessions, so the query names `isActive: true` (schema.prisma, spec 0002 C21).
function archiveActive(
  tx: Prisma.TransactionClient,
  userId: string,
  exceptId?: string,
): Promise<Prisma.BatchPayload> {
  return tx.fittingSession.updateMany({
    where: { userId, isActive: true, id: exceptId === undefined ? undefined : { not: exceptId } },
    data: { isActive: false },
  });
}

// A user has at most one active session (spec 0004 E11, E48): activating one archives the other in
// the same transaction. Of two activations whose transactions overlap, the second hits the partial
// unique index (P2002) and AppExceptionFilter answers 409 ALREADY_EXISTS; nothing is retried. A missing user is
// P2003, 400 RELATED_NOT_FOUND; a missing session 404. Deleting a session removes its generations
// (database cascade, spec 0002 C8) and their files (spec 0011 M11), and activates no other one.
@Injectable()
export class FittingSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileDeletion: FileDeletion,
  ) {}

  async list(query: FittingSessionListQueryDto): Promise<Paginated<FittingSessionResponseDto>> {
    const where: Prisma.FittingSessionWhereInput = { userId: query.userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fittingSession.findMany({
        where,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.fittingSession.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<FittingSessionResponseDto> {
    const session = await this.prisma.fittingSession.findUnique({ where: { id } });
    if (session === null) {
      throw new NotFoundError('Fitting session not found');
    }
    return session;
  }

  // Left out, `isActive` is true, as the column's default.
  create(dto: CreateFittingSessionDto): Promise<FittingSessionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive !== false) {
        await archiveActive(tx, dto.userId);
      }
      return tx.fittingSession.create({ data: dto });
    });
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateFittingSessionDto): Promise<FittingSessionResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive === true) {
        const session = await tx.fittingSession.findUnique({
          where: { id },
          select: { userId: true },
        });
        if (session === null) {
          throw new NotFoundError('Fitting session not found');
        }
        await archiveActive(tx, session.userId, id);
      }
      return tx.fittingSession.update({ where: { id }, data: dto });
    });
  }

  // The generations' folders are read inside the delete's transaction, after the session's row is
  // locked: a generation created at the same time either commits before the lock (and is read) or
  // waits for it and fails on the gone session (400), so the cascade takes no generation unread.
  async delete(id: string): Promise<void> {
    const { session, generationIds } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM fitting_sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const generations = await tx.aiGeneration.findMany({
        where: { sessionId: id },
        select: { id: true },
      });
      const deleted = await tx.fittingSession.delete({
        where: { id },
        select: { id: true, userId: true },
      });
      return { session: deleted, generationIds: generations.map((generation) => generation.id) };
    });
    await this.fileDeletion.startFileDeletion(
      'session',
      session.id,
      generationIds.map((generationId) => generationFolder(session.userId, generationId)),
    );
  }
}
