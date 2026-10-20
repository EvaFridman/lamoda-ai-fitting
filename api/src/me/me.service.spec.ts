import { describe, expect, it, vi } from 'vitest';

import type { Auth } from '../auth/auth.js';
import { NotFoundError, UnauthorizedError } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import type { UserResponseDto } from '../users/dto/user-response.dto.js';
import type { UsersService } from '../users/users.service.js';
import { MeService } from './me.service.js';

function setup() {
  const users = { get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const service = new MeService(users as unknown as UsersService, {} as Auth);
  return { users, service };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

describe('MeService.update', () => {
  it('passes the id and the changes on and answers the updated user', async () => {
    const { users, service } = setup();
    const user = { id: 'user-id', firstName: 'Мария' } as UserResponseDto;
    users.update.mockResolvedValue(user);

    await expect(service.update('user-id', { firstName: 'Мария' })).resolves.toBe(user);

    expect(users.update).toHaveBeenCalledWith('user-id', { firstName: 'Мария' });
  });

  it('answers 401 when an empty body finds no row (NotFoundError)', async () => {
    const { users, service } = setup();
    users.update.mockRejectedValue(new NotFoundError('User not found'));

    await expect(service.update('user-id', {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('answers 401 when the write finds no row (P2025)', async () => {
    const { users, service } = setup();
    users.update.mockRejectedValue(prismaError('P2025'));

    await expect(service.update('user-id', { lastName: 'Иванова' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('lets another Prisma error through as it is', async () => {
    const { users, service } = setup();
    const error = prismaError('P2002');
    users.update.mockRejectedValue(error);

    await expect(service.update('user-id', { lastName: 'Иванова' })).rejects.toBe(error);
  });

  it('lets any other error through as it is', async () => {
    const { users, service } = setup();
    const error = new Error('database down');
    users.update.mockRejectedValue(error);

    await expect(service.update('user-id', { lastName: 'Иванова' })).rejects.toBe(error);
  });
});
