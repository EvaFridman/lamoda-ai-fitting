import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SignedIn } from '../../common/auth/access.decorators.js';
import { CurrentUserId } from '../../common/auth/current-principal.decorator.js';
import { ApiErrors } from '../../common/errors/api-errors.decorator.js';
import { MeService } from '../me.service.js';
import { signOutWhenGone } from '../sign-out-when-gone.js';
import { FittingRoomChangeDto, FittingRoomDto } from './dto/fitting-room.dto.js';
import { FittingRoomSlotParamDto } from './dto/fitting-room-slot-param.dto.js';
import { PutFittingRoomItemDto } from './dto/put-fitting-room-item.dto.js';
import { FittingRoomService } from './fitting-room.service.js';

// The signed-in user's fitting room (spec 0019 plan §5, A12, A86): one item per slot, the same on
// every device. As /me/photos, a deleted user's cached session gets 401 with the session cookies
// expired on every write (spec 0013 N31, N38); the room is then empty.
@ApiTags('me')
@Controller('me/fitting-room')
@SignedIn()
export class FittingRoomController {
  constructor(
    private readonly room: FittingRoomService,
    private readonly me: MeService,
  ) {}

  @Get()
  @ApiOkResponse({ type: FittingRoomDto })
  get(@CurrentUserId() userId: string): Promise<FittingRoomDto> {
    return this.room.get(userId);
  }

  // Inserts or replaces, so a repeat changes nothing: 200 either way (A86.1).
  @Put(':slot')
  @ApiOkResponse({ type: FittingRoomChangeDto })
  @ApiErrors('RELATED_NOT_FOUND')
  put(
    @CurrentUserId() userId: string,
    @Param() { slot }: FittingRoomSlotParamDto,
    @Body() dto: PutFittingRoomItemDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FittingRoomChangeDto> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.room.put(userId, slot, dto),
    );
  }

  @Delete(':slot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The slot is empty, as it may have been already.' })
  remove(
    @CurrentUserId() userId: string,
    @Param() { slot }: FittingRoomSlotParamDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.room.remove(userId, slot),
    );
  }

  // «Очистить примерочную» (A62).
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The room is empty.' })
  clear(@CurrentUserId() userId: string, @Res({ passthrough: true }) res: Response): Promise<void> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.room.clear(userId),
    );
  }
}
