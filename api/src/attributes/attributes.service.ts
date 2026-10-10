import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Attribute, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAttributeDto } from './dto/create-attribute.dto.js';
import type { UpdateAttributeDto } from './dto/update-attribute.dto.js';

// Names are unique, the id keeps the order fixed anyway (spec 0004 E42).
const ORDER: Prisma.AttributeOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];

// Duplicates, an attribute that still has values and a missing id reach AppExceptionFilter as
// Prisma errors: 409 ALREADY_EXISTS, 409 IN_USE, 404 NOT_FOUND.
@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto): Promise<Paginated<Attribute>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attribute.findMany({ orderBy: ORDER, take: query.limit, skip: query.offset }),
      this.prisma.attribute.count(),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Attribute> {
    const attribute = await this.prisma.attribute.findUnique({ where: { id } });
    if (attribute === null) {
      throw new NotFoundError('Attribute not found');
    }
    return attribute;
  }

  create(dto: CreateAttributeDto): Promise<Attribute> {
    return this.prisma.attribute.create({ data: dto });
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateAttributeDto): Promise<Attribute> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    return this.prisma.attribute.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.attribute.delete({ where: { id } });
  }
}
