import { Inject, Injectable } from '@nestjs/common';

import type { Auth } from '../auth/auth.js';
import { AUTH } from '../auth/auth.module.js';
import { NotFoundError, UnauthorizedError } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import type { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UsersService } from '../users/users.service.js';

// A cookie Better Auth sets, with the attributes it sets it with.
export interface AuthCookie {
  name: string;
  // `sameSite` as Better Auth types it, in either case.
  attributes: {
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None' | 'strict' | 'lax' | 'none';
  };
}

// The signed-in user's own row (spec 0013 plan §6). A session copy cached in a cookie (N18) can
// name a user deleted since, for up to 5 minutes: finding no row is 401, not 404 (N31), and no
// database read is added to tell it apart earlier.
@Injectable()
export class MeService {
  constructor(
    private readonly users: UsersService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async get(userId: string): Promise<UserResponseDto> {
    try {
      return await this.users.get(userId);
    } catch (error) {
      throw error instanceof NotFoundError ? gone() : error;
    }
  }

  // The user's sessions and accounts go by the database cascade, the fitting data too (spec 0002
  // C8), and then the files (spec 0011 M11, through UsersService.delete).
  async delete(userId: string): Promise<void> {
    try {
      await this.users.delete(userId);
    } catch (error) {
      throw error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
        ? gone()
        : error;
    }
  }

  // The cookies Better Auth's own sign-out expires: the session token, its cached copy (N18) and
  // the "don't remember me" flag. The copy is never split into several cookies: it holds no image
  // and short fields only.
  async sessionCookies(): Promise<AuthCookie[]> {
    const { authCookies } = await this.auth.$context;
    return [authCookies.sessionToken, authCookies.sessionData, authCookies.dontRememberToken];
  }
}

function gone(): UnauthorizedError {
  return new UnauthorizedError('The signed-in user no longer exists');
}
