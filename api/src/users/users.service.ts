import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

// Newest first, the id keeps the order fixed (spec 0004 E47).
const ORDER: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

// `date` columns come and go as `YYYY-MM-DD`, not as a midnight timestamp.
function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
}

function toResponse(user: User): UserResponseDto {
  return { ...user, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null };
}

// A duplicate phone or email and a missing id reach AppExceptionFilter as Prisma errors:
// 409 ALREADY_EXISTS, 404 NOT_FOUND. Deleting a user removes their fitting sessions and
// generations (database cascade, spec 0002 C8).
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto): Promise<Paginated<UserResponseDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ orderBy: ORDER, take: query.limit, skip: query.offset }),
      this.prisma.user.count(),
    ]);
    return { items: items.map(toResponse), total };
  }

  async get(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user === null) {
      throw new NotFoundError('User not found');
    }
    return toResponse(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: { ...dto, dateOfBirth: toDate(dto.dateOfBirth) },
    });
    return toResponse(user);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...dto, dateOfBirth: toDate(dto.dateOfBirth) },
    });
    return toResponse(user);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}
