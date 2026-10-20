import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { CursorPaginated } from '../common/pagination/cursor-paginated.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ProductFacetsDto } from './dto/product-facets-response.dto.js';
import type { ProductFilterQueryDto } from './dto/product-filter-query.dto.js';
import type { ProductListQueryDto } from './dto/product-list-query.dto.js';
import type { ProductDetailDto, ProductListItemDto } from './dto/product-response.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { countFacets } from './listing/product-facets.js';
import { loadValueAttributes, toProductFilter, toProductSql } from './listing/product-filter.js';
import {
  afterCursorSql,
  decodeProductCursor,
  encodeProductCursor,
  type ProductKeyRow,
} from './listing/product-cursor.js';
import { inIdOrder, productCountSql, productPageSql } from './listing/product-list.js';
import { DETAIL_INCLUDE, LIST_ITEM_INCLUDE, toDetail, toListItem } from './product-mapper.js';

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

  async list(query: ProductListQueryDto): Promise<CursorPaginated<ProductListItemDto>> {
    const { sort, limit } = query;
    const valueAttributes = await loadValueAttributes(this.prisma, query.attributeValueId);
    const where = toProductSql(toProductFilter(query, valueAttributes));
    const cursor = query.cursor === undefined ? null : decodeProductCursor(query.cursor, sort);
    // The DTO has checked it: a refusal here is a bug, not a request for the first batch.
    if (query.cursor !== undefined && cursor === null) {
      throw new Error('A cursor passed the DTO but did not decode');
    }
    const afters = cursor === null ? [undefined] : afterCursorSql(cursor);
    // The ids, the rows and the total from one snapshot (spec 0014 plan §2.2).
    const { rows, keys, total } = await this.prisma.$transaction(
      async (tx) => {
        // One row past the batch tells whether a next one exists.
        const keys: ProductKeyRow[] = [];
        for (const after of afters) {
          if (keys.length > limit) break;
          keys.push(
            ...(await tx.$queryRaw<ProductKeyRow[]>(
              productPageSql({
                where,
                after,
                sort,
                limit: limit + 1 - keys.length,
                offset: query.offset,
              }),
            )),
          );
        }
        const ids = keys.slice(0, limit).map((row) => row.id);
        const found =
          ids.length === 0
            ? []
            : await tx.product.findMany({
                where: { id: { in: ids } },
                include: LIST_ITEM_INCLUDE,
              });
        // A batch after the first is not counted (O44).
        const total =
          cursor === null
            ? (await tx.$queryRaw<[{ count: number }]>(productCountSql(where)))[0].count
            : null;
        return { rows: inIdOrder(ids, found), keys, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const last = keys.length > limit ? keys[limit - 1] : undefined;
    return {
      items: rows.map((row) => toListItem(row, this.mediaBaseUrl)),
      total,
      nextCursor: last === undefined ? null : encodeProductCursor(sort, last),
    };
  }

  async facets(query: ProductFilterQueryDto): Promise<ProductFacetsDto> {
    const valueAttributes = await loadValueAttributes(this.prisma, query.attributeValueId);
    return countFacets(this.prisma, toProductFilter(query, valueAttributes));
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
