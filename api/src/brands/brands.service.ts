import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { Brand, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

// Names are unique, the id keeps the order fixed anyway (spec 0004 E39).
const ORDER: Prisma.BrandOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];

// Duplicates, a brand with products and a missing id reach AppExceptionFilter as Prisma errors:
// 409 ALREADY_EXISTS, 409 IN_USE, 404 NOT_FOUND.
@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto): Promise<Paginated<Brand>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({ orderBy: ORDER, take: query.limit, skip: query.offset }),
      this.prisma.brand.count(),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (brand === null) {
      throw new NotFoundError('Brand not found');
    }
    return brand;
  }

  create(dto: CreateBrandDto): Promise<Brand> {
    return this.prisma.brand.create({ data: dto });
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    return this.prisma.brand.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.brand.delete({ where: { id } });
  }
}
