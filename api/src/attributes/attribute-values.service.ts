import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import { createUnderParent } from '../common/errors/create-under-parent.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { AttributeValue, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAttributeValueDto } from './dto/create-attribute-value.dto.js';
import type { UpdateAttributeValueDto } from './dto/update-attribute-value.dto.js';

// Values are unique within an attribute, the id keeps the order fixed anyway (spec 0004 E42).
const ORDER: Prisma.AttributeValueOrderByWithRelationInput[] = [{ value: 'asc' }, { id: 'asc' }];

// A value is found only under its own attribute: under another one it is 404 (spec 0004 E42).
// Duplicates within the attribute, a value used by products and a value missing under the
// attribute reach AppExceptionFilter as Prisma errors: 409 ALREADY_EXISTS, 409 IN_USE,
// 404 NOT_FOUND.
@Injectable()
export class AttributeValuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(attributeId: string, query: PaginationQueryDto): Promise<Paginated<AttributeValue>> {
    const where = { attributeId };
    const [attribute, items, total] = await this.prisma.$transaction([
      this.prisma.attribute.findUnique({ where: { id: attributeId }, select: { id: true } }),
      this.prisma.attributeValue.findMany({
        where,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.attributeValue.count({ where }),
    ]);
    if (attribute === null) {
      throw attributeNotFound();
    }
    return { items, total };
  }

  async get(attributeId: string, id: string): Promise<AttributeValue> {
    const value = await this.prisma.attributeValue.findUnique({ where: { id, attributeId } });
    if (value === null) {
      throw new NotFoundError('Attribute value not found');
    }
    return value;
  }

  // A missing attribute is 404, not RELATED_NOT_FOUND: it is part of the address (spec 0004 E42).
  create(attributeId: string, dto: CreateAttributeValueDto): Promise<AttributeValue> {
    return createUnderParent(
      async () =>
        (await this.prisma.attribute.findUnique({
          where: { id: attributeId },
          select: { id: true },
        })) !== null,
      attributeNotFound,
      () => this.prisma.attributeValue.create({ data: { attributeId, value: dto.value } }),
    );
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(
    attributeId: string,
    id: string,
    dto: UpdateAttributeValueDto,
  ): Promise<AttributeValue> {
    if (Object.keys(dto).length === 0) {
      return this.get(attributeId, id);
    }
    return this.prisma.attributeValue.update({ where: { id, attributeId }, data: dto });
  }

  async delete(attributeId: string, id: string): Promise<void> {
    await this.prisma.attributeValue.delete({ where: { id, attributeId } });
  }
}

function attributeNotFound(): NotFoundError {
  return new NotFoundError('Attribute not found');
}
