import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { NotFoundError } from './app.exception.js';
import { createUnderParent } from './create-under-parent.js';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma failed', {
    code,
    clientVersion: '7.10.0',
  });
}

const parentNotFound = () => new NotFoundError('Parent not found');

describe('createUnderParent', () => {
  it('returns the result of create when the parent exists', async () => {
    const parentExists = vi.fn().mockResolvedValue(true);
    const create = vi.fn().mockResolvedValue({ id: 'row' });

    await expect(createUnderParent(parentExists, parentNotFound, create)).resolves.toEqual({
      id: 'row',
    });
    expect(parentExists).toHaveBeenCalledTimes(1);
  });

  it('throws parentNotFound and does not insert when the parent is missing', async () => {
    const parentExists = vi.fn().mockResolvedValue(false);
    const create = vi.fn();

    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toThrow(
      new NotFoundError('Parent not found'),
    );
    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('throws parentNotFound when the insert breaks a foreign key and the parent is gone', async () => {
    const parentExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const create = vi.fn().mockRejectedValue(prismaError('P2003'));

    const error: unknown = await createUnderParent(parentExists, parentNotFound, create).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe('Parent not found');
    expect(parentExists).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original P2003 when the parent still exists', async () => {
    const original = prismaError('P2003');
    const parentExists = vi.fn().mockResolvedValue(true);
    const create = vi.fn().mockRejectedValue(original);

    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toBe(original);
    expect(parentExists).toHaveBeenCalledTimes(2);
  });

  it('rethrows another Prisma error without checking the parent again', async () => {
    const original = prismaError('P2002');
    const parentExists = vi.fn().mockResolvedValue(true);
    const create = vi.fn().mockRejectedValue(original);

    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toBe(original);
    expect(parentExists).toHaveBeenCalledTimes(1);
  });

  it('rethrows a non-Prisma error without checking the parent again', async () => {
    const original = new Error('boom');
    const parentExists = vi.fn().mockResolvedValue(true);
    const create = vi.fn().mockRejectedValue(original);

    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toBe(original);
    expect(parentExists).toHaveBeenCalledTimes(1);
  });

  it('lets a failure of the second parent check through', async () => {
    const failure = new Error('db down');
    const parentExists = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(failure);
    const create = vi.fn().mockRejectedValue(prismaError('P2003'));

    await expect(createUnderParent(parentExists, parentNotFound, create)).rejects.toBe(failure);
  });
});
