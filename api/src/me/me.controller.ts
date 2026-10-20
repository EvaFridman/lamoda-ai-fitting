import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { UnauthorizedError } from '../common/errors/app.exception.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { type AuthCookie, MeService } from './me.service.js';

// The signed-in user's own data (spec 0013 N8, N11; 0017 U1). A deleted user's cached session gets
// 401 on every route (N31), and that answer expires the session cookies too (N38).
@ApiTags('me')
@Controller('me')
@SignedIn()
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOkResponse({ type: UserResponseDto })
  get(
    @CurrentUserId() userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    return this.signOutWhenGone(res, () => this.me.get(userId));
  }

  // The user's own names, date of birth and gender (spec 0017 U2); nothing else can be sent (AC11).
  @Patch()
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateMeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    return this.signOutWhenGone(res, () => this.me.update(userId, dto));
  }

  // Deletes the account and signs this browser out at once: the answer expires the session
  // cookies (AC12). Another browser's cached session lasts up to 5 minutes (N31).
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Expires the session cookies.' })
  async delete(
    @CurrentUserId() userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.signOutWhenGone(res, () => this.me.delete(userId));
    await this.expireSessionCookies(res);
  }

  // MeService's 401 means the user is gone: the browser is signed out with it, so neither its
  // cached copy nor the token outlives the account (N38). Other failures keep the cookies.
  private async signOutWhenGone<T>(res: Response, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await this.expireSessionCookies(res);
      }
      throw error;
    }
  }

  // A handler that outlived REQUEST_TIMEOUT_MS has had its 503 sent already: nothing to set then.
  private async expireSessionCookies(res: Response): Promise<void> {
    if (res.headersSent) return;
    for (const { name, attributes } of await this.me.sessionCookies()) {
      res.clearCookie(name, {
        path: attributes.path,
        domain: attributes.domain,
        secure: attributes.secure,
        // Express's types take lower case only (its `cookie` lower-cases the value either way).
        sameSite: attributes.sameSite?.toLowerCase() as
          Lowercase<NonNullable<AuthCookie['attributes']['sameSite']>> | undefined,
        httpOnly: true,
      });
    }
  }
}
