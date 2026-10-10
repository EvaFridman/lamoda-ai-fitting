import { NotFoundError } from '../common/errors/app.exception.js';
import { createUnderParent } from '../common/errors/create-under-parent.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// The parts of a product (images, sizes, attribute links) take the product only from the path.
// A missing product is 404, not RELATED_NOT_FOUND: it is part of the address (spec 0004 E44).

export function productNotFound(): NotFoundError {
  return new NotFoundError('Product not found');
}

export function findProduct(prisma: PrismaService, id: string) {
  return prisma.product.findUnique({ where: { id }, select: { id: true } });
}

export function createPart<T>(
  prisma: PrismaService,
  productId: string,
  create: () => Promise<T>,
): Promise<T> {
  return createUnderParent(
    async () => (await findProduct(prisma, productId)) !== null,
    productNotFound,
    create,
  );
}
