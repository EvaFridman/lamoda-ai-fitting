import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ProductDetailDto, ProductListItemDto } from './dto/product-response.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { DETAIL_INCLUDE, LIST_ITEM_INCLUDE, toDetail, toListItem } from './product-mapper.js';

// Newest first, the id last so products created in the same millisecond page in one fixed order
// (spec 0004 E43). The sorts of E14 replace it in T11.
const ORDER: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

// A duplicate article, a missing brand or category, a product used in a generation and a missing
// id reach AppExceptionFilter as Prisma errors: 409 ALREADY_EXISTS, 400 RELATED_NOT_FOUND,
// 409 IN_USE, 404 NOT_FOUND. Deleting a product removes its images, sizes and attribute links
// (cascade, 0002 C8).
@Injectable()
export class ProductsService {
  private readonly mediaBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.mediaBaseUrl = config.get('MEDIA_BASE_URL', { infer: true });
  }

  async list(query: PaginationQueryDto): Promise<Paginated<ProductListItemDto>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        include: LIST_ITEM_INCLUDE,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.product.count(),
    ]);
    return { items: rows.map((row) => toListItem(row, this.mediaBaseUrl)), total };
  }

  async get(id: string): Promise<ProductDetailDto> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (row === null) {
      throw new NotFoundError('Product not found');
    }
    return toDetail(row, this.mediaBaseUrl);
  }

  async create(dto: CreateProductDto): Promise<ProductDetailDto> {
    const row = await this.prisma.product.create({ data: dto, include: DETAIL_INCLUDE });
    return toDetail(row, this.mediaBaseUrl);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateProductDto): Promise<ProductDetailDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    const row = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: DETAIL_INCLUDE,
    });
    return toDetail(row, this.mediaBaseUrl);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }
}
