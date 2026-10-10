import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../common/errors/app.exception.js';
import type { Paginated } from '../common/pagination/paginated.js';
import type { Category, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { ListCategoriesQueryDto } from './dto/list-categories-query.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

// The id last, so equal sort orders and names still page in one fixed order (spec 0004 E39).
const ORDER: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

// Duplicates, a category with products and a missing id reach AppExceptionFilter as Prisma
// errors: 409 ALREADY_EXISTS, 409 IN_USE, 404 NOT_FOUND.
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoriesQueryDto): Promise<Paginated<Category>> {
    const where: Prisma.CategoryWhereInput = { isActive: query.isActive };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: ORDER,
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (category === null) {
      throw new NotFoundError('Category not found');
    }
    return category;
  }

  create(dto: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({ data: dto });
  }

  // An empty body changes nothing, `updatedAt` included (spec 0004 E40).
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    if (Object.keys(dto).length === 0) {
      return this.get(id);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }
}
