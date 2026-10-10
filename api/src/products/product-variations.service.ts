import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { ProductVariation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductVariationDto } from './dto/create-product-variation.dto.js';
import type { UpdateProductVariationDto } from './dto/update-product-variation.dto.js';
import { VARIATION_ORDER } from './product-mapper.js';
import { createPart, findProduct, productNotFound } from './product-parts.js';

// A size is found only under its own product: under another one it is 404 (spec 0004 E44).
// A size taken within the product and a size missing under it reach AppExceptionFilter as Prisma
// errors: 409 ALREADY_EXISTS, 404 NOT_FOUND.
@Injectable()
export class ProductVariationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(productId: string, query: PaginationQueryDto): Promise<Paginated<ProductVariation>> {
    const where = { productId };
    const [product, items, total] = await this.prisma.$transaction([
      findProduct(this.prisma, productId),
      this.prisma.productVariation.findMany({
        where,
        orderBy: VARIATION_ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.productVariation.count({ where }),
    ]);
    if (product === null) {
      throw productNotFound();
    }
    return { items, total };
  }

  async get(productId: string, id: string): Promise<ProductVariation> {
    const variation = await this.prisma.productVariation.findUnique({ where: { id, productId } });
    if (variation === null) {
      throw new NotFoundError('Product size not found');
    }
    return variation;
  }

  async create(productId: string, dto: CreateProductVariationDto): Promise<ProductVariation> {
    return createPart(this.prisma, productId, () =>
      this.prisma.productVariation.create({ data: { productId, ...dto } }),
    );
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(
    productId: string,
    id: string,
    dto: UpdateProductVariationDto,
  ): Promise<ProductVariation> {
    if (Object.keys(dto).length === 0) {
      return this.get(productId, id);
    }
    return this.prisma.productVariation.update({ where: { id, productId }, data: dto });
  }

  async delete(productId: string, id: string): Promise<void> {
    await this.prisma.productVariation.delete({ where: { id, productId } });
  }
}
