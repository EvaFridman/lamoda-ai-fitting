import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotFoundError } from '../common/errors/app.exception.js';
import { toMediaUrl } from '../common/media/media-url.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Env } from '../config/env.js';
import type { ProductImage } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductImageDto } from './dto/create-product-image.dto.js';
import type { ProductImageResponseDto } from './dto/product-part-response.dto.js';
import type { UpdateProductImageDto } from './dto/update-product-image.dto.js';
import { IMAGE_ORDER } from './product-mapper.js';
import { createPart, findProduct, productNotFound } from './product-parts.js';

// An image is found only under its own product: under another one it is 404 (spec 0004 E44).
// An image missing under the product reaches AppExceptionFilter as a Prisma error: 404 NOT_FOUND.
@Injectable()
export class ProductImagesService {
  private readonly mediaBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.mediaBaseUrl = config.get('MEDIA_BASE_URL', { infer: true });
  }

  async list(
    productId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<ProductImageResponseDto>> {
    const where = { productId };
    const [product, rows, total] = await this.prisma.$transaction([
      findProduct(this.prisma, productId),
      this.prisma.productImage.findMany({
        where,
        orderBy: IMAGE_ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.productImage.count({ where }),
    ]);
    if (product === null) {
      throw productNotFound();
    }
    return { items: rows.map((row) => this.toResponse(row)), total };
  }

  async get(productId: string, id: string): Promise<ProductImageResponseDto> {
    const row = await this.prisma.productImage.findUnique({ where: { id, productId } });
    if (row === null) {
      throw new NotFoundError('Product image not found');
    }
    return this.toResponse(row);
  }

  async create(productId: string, dto: CreateProductImageDto): Promise<ProductImageResponseDto> {
    const row = await createPart(this.prisma, productId, () =>
      this.prisma.productImage.create({ data: { productId, ...dto } }),
    );
    return this.toResponse(row);
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(
    productId: string,
    id: string,
    dto: UpdateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    if (Object.keys(dto).length === 0) {
      return this.get(productId, id);
    }
    const row = await this.prisma.productImage.update({ where: { id, productId }, data: dto });
    return this.toResponse(row);
  }

  async delete(productId: string, id: string): Promise<void> {
    await this.prisma.productImage.delete({ where: { id, productId } });
  }

  private toResponse(row: ProductImage): ProductImageResponseDto {
    return { ...row, url: toMediaUrl(this.mediaBaseUrl, row.imageKey) };
  }
}
