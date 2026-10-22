import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { MeService } from './me.service.js';
import { expireSessionCookies, signOutWhenGone } from './sign-out-when-gone.js';

// The signed-in user's own data (spec 0013 N8, N11; 0017 U1). A deleted user's cached session gets
// 401 on every route (N31), and that answer expires the session cookies too (N38,
// sign-out-when-gone.ts, shared with the photos' routes of spec 0019).
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
    return signOutWhenGone(res, this.cookies, () => this.me.get(userId));
  }

  // The user's own names, date of birth and gender (spec 0017 U2); nothing else can be sent (AC11).
  @Patch()
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateMeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    return signOutWhenGone(res, this.cookies, () => this.me.update(userId, dto));
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
    await signOutWhenGone(res, this.cookies, () => this.me.delete(userId));
    await expireSessionCookies(res, this.cookies);
  }

  private readonly cookies = () => this.me.sessionCookies();
}
