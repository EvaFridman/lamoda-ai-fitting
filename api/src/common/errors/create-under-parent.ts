import { Prisma } from '../../generated/prisma/client.js';
import type { AppException } from './app.exception.js';

// Creates a nested record (an attribute's value, a product's image, size or attribute link) under
// the parent from the path. A missing parent is 404, not 400 RELATED_NOT_FOUND: it is part of the
// address (spec 0004 E42, E44). The parent is checked before the insert, and again when the insert
// breaks a foreign key: a parent deleted in between is 404 too. Any other foreign key error (a
// missing value named in the body) goes on to AppExceptionFilter as it is.
export async function createUnderParent<T>(
  parentExists: () => Promise<boolean>,
  parentNotFound: () => AppException,
  create: () => Promise<T>,
): Promise<T> {
  if (!(await parentExists())) {
    throw parentNotFound();
  }
  try {
    return await create();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003' &&
      !(await parentExists())
    ) {
      throw parentNotFound();
    }
    throw error;
  }
}
