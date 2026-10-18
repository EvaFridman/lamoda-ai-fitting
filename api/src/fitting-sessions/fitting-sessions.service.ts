import { Injectable } from '@nestjs/common';

import { NotFoundError, UnauthorizedError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generationFolder } from '../storage/keys.js';
import { FileDeletion } from '../temporal/file-deletion.js';
import type { CreateFittingSessionDto } from './dto/create-fitting-session.dto.js';
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

function notFound(): NotFoundError {
  return new NotFoundError('Fitting session not found');
}

// Each method takes the signed-in user's id and sees only that user's sessions: someone else's is
// 404, as one that does not exist (spec 0013 N8, AC8). A user has at most one active session (spec
// 0004 E11, E48): activating one archives the other in the same transaction. Of two activations
// whose transactions overlap, the second hits the partial unique index (P2002) and
// AppExceptionFilter answers 409 ALREADY_EXISTS; nothing is retried. A create for a user whose row
// is gone (a deleted account's cached session) is 401 (N31). Deleting a session removes its
// generations (database cascade, spec 0002 C8) and their files (spec 0011 M11), and activates no
// other one.
@Injectable()
export class FittingSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileDeletion: FileDeletion,
  ) {}

  async list(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<FittingSessionResponseDto>> {
    const where: Prisma.FittingSessionWhereInput = { userId };
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

  async get(userId: string, id: string): Promise<FittingSessionResponseDto> {
    const session = await this.prisma.fittingSession.findUnique({ where: { id, userId } });
    if (session === null) {
      throw notFound();
    }
    return session;
  }

  // Left out, `isActive` is true, as the column's default.
  async create(userId: string, dto: CreateFittingSessionDto): Promise<FittingSessionResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isActive !== false) {
          await archiveActive(tx, userId);
        }
        return tx.fittingSession.create({ data: { ...dto, userId } });
      });
    } catch (error) {
      // The user is the session's only reference.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new UnauthorizedError('The signed-in user no longer exists');
      }
      throw error;
    }
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40). Someone else's session is
  // found by neither query, so nothing of theirs is archived.
  async update(
    userId: string,
    id: string,
    dto: UpdateFittingSessionDto,
  ): Promise<FittingSessionResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(userId, id);
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive === true) {
        const session = await tx.fittingSession.findUnique({
          where: { id, userId },
          select: { id: true },
        });
        if (session === null) {
          throw notFound();
        }
        await archiveActive(tx, userId, id);
      }
      // A miss is P2025, which AppExceptionFilter answers with 404.
      return tx.fittingSession.update({ where: { id, userId }, data: dto });
    });
  }

  // The generations' folders are read inside the delete's transaction, after the session's row is
  // locked: a generation created at the same time either commits before the lock (and is read) or
  // waits for it and fails on the gone session (400), so the cascade takes no generation unread.
  async delete(userId: string, id: string): Promise<void> {
    const { session, generationIds } = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM fitting_sessions WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) {
        throw notFound();
      }
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
