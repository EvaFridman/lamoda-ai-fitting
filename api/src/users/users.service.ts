import { Injectable, Logger } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { userFolders } from '../storage/keys.js';
import { noKeyDetails, ownedLink, ownerFolderDetails } from '../storage/owner-check.js';
import { StorageService } from '../storage/storage.service.js';
import { FileDeletion } from '../temporal/file-deletion.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

// Newest first, the id keeps the order fixed (spec 0004 E47).
const ORDER: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

// `PATCH /me` may also clear `firstName` (spec 0017 U9): the column is nullable (0013 N5).
type UserChanges = Omit<UpdateUserDto, 'firstName'> & { firstName?: string | null };

// `date` columns come and go as `YYYY-MM-DD`, not as a midnight timestamp.
function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
}

// A duplicate phone or email and a missing id reach AppExceptionFilter as Prisma errors:
// 409 ALREADY_EXISTS, 404 NOT_FOUND. Deleting a user removes their fitting sessions and
// generations (database cascade, spec 0002 C8), and then their files (spec 0011 M11). The fitting photo's key must lie in the user's
// folder (spec 0011 M8); responses carry a signed link to it (M9), only for such a key (M25).
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fileDeletion: FileDeletion,
  ) {}

  async list(query: PaginationQueryDto): Promise<Paginated<UserResponseDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ orderBy: ORDER, take: query.limit, skip: query.offset }),
      this.prisma.user.count(),
    ]);
    return { items: await Promise.all(items.map((user) => this.toResponse(user))), total };
  }

  async get(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user === null) {
      throw new NotFoundError('User not found');
    }
    return this.toResponse(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const details = noKeyDetails({ fittingProfileImageKey: dto.fittingProfileImageKey });
    if (details.length > 0) {
      throw new ValidationError(details);
    }
    const user = await this.prisma.user.create({
      data: { ...dto, dateOfBirth: toDate(dto.dateOfBirth) },
    });
    return this.toResponse(user);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40). A key is checked against
  // the id the database holds, not the path's (its case may differ).
  async update(id: string, dto: UserChanges): Promise<UserResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    if (typeof dto.fittingProfileImageKey === 'string') {
      const stored = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (stored === null) {
        throw new NotFoundError('User not found');
      }
      const details = ownerFolderDetails(
        { fittingProfileImageKey: dto.fittingProfileImageKey },
        stored.id,
      );
      if (details.length > 0) {
        throw new ValidationError(details);
      }
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...dto, dateOfBirth: toDate(dto.dateOfBirth) },
    });
    return this.toResponse(user);
  }

  // The files go after the row, by the id the database holds (keys use it in lower case).
  async delete(id: string): Promise<void> {
    const user = await this.prisma.user.delete({ where: { id }, select: { id: true } });
    await this.fileDeletion.startFileDeletion('user', user.id, userFolders(user.id));
  }

  // `emailVerified` is Better Auth's (always true from Google), not part of the answer.
  private async toResponse({
    emailVerified: _emailVerified,
    ...user
  }: User): Promise<UserResponseDto> {
    return {
      ...user,
      dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      fittingProfileImageUrl: await ownedLink(this.storage, this.logger, {
        rowId: user.id,
        field: 'fittingProfileImageKey',
        key: user.fittingProfileImageKey,
        ownerId: user.id,
      }),
    };
  }
}
