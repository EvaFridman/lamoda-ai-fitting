import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto.js';
import type { ProductAttributeValueResponseDto } from './dto/product-part-response.dto.js';
import { ATTRIBUTE_LINK_ORDER } from './product-mapper.js';
import { createPart, findProduct, productNotFound } from './product-parts.js';

const INCLUDE = {
  attributeValue: {
    select: { id: true, value: true, attribute: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ProductAttributeValueInclude;

type LinkRow = Prisma.ProductAttributeValueGetPayload<{ include: typeof INCLUDE }>;

// The links between a product and attribute values: list, read, add, remove; no update
// (spec 0004 E44). A missing value, a value already linked and a link missing under the product
// reach AppExceptionFilter as Prisma errors: 400 RELATED_NOT_FOUND, 409 ALREADY_EXISTS,
// 404 NOT_FOUND.
@Injectable()
export class ProductAttributeValuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    productId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<ProductAttributeValueResponseDto>> {
    const where = { productId };
    const [product, rows, total] = await this.prisma.$transaction([
      findProduct(this.prisma, productId),
      this.prisma.productAttributeValue.findMany({
        where,
        include: INCLUDE,
        orderBy: ATTRIBUTE_LINK_ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.productAttributeValue.count({ where }),
    ]);
    if (product === null) {
      throw productNotFound();
    }
    return { items: rows.map(toResponse), total };
  }

  async get(
    productId: string,
    attributeValueId: string,
  ): Promise<ProductAttributeValueResponseDto> {
    const row = await this.prisma.productAttributeValue.findUnique({
      where: { productId_attributeValueId: { productId, attributeValueId } },
      include: INCLUDE,
    });
    if (row === null) {
      throw new NotFoundError('Attribute value is not linked to the product');
    }
    return toResponse(row);
  }

  // Scalar ids, not `connect`: a missing value is RELATED_NOT_FOUND (CLAUDE.md, Conventions).
  async create(
    productId: string,
    dto: CreateProductAttributeValueDto,
  ): Promise<ProductAttributeValueResponseDto> {
    const row = await createPart(this.prisma, productId, () =>
      this.prisma.productAttributeValue.create({
        data: { productId, attributeValueId: dto.attributeValueId },
        include: INCLUDE,
      }),
    );
    return toResponse(row);
  }

  async delete(productId: string, attributeValueId: string): Promise<void> {
    await this.prisma.productAttributeValue.delete({
      where: { productId_attributeValueId: { productId, attributeValueId } },
    });
  }
}

function toResponse(row: LinkRow): ProductAttributeValueResponseDto {
  const { attribute, id, value } = row.attributeValue;
  return {
    productId: row.productId,
    attributeValueId: row.attributeValueId,
    attribute,
    value: { id, value },
    createdAt: row.createdAt,
  };
}
