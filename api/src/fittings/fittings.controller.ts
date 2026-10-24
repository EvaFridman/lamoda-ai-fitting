import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { ApiErrors } from '../common/errors/api-errors.decorator.js';
import {
  ApiCursorPaginatedResponse,
  type CursorPaginated,
} from '../common/pagination/cursor-paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { MeService } from '../me/me.service.js';
import { signOutWhenGone } from '../me/sign-out-when-gone.js';
import { Expensive } from '../throttling/tiered-throttler.guard.js';
import { FittingListQueryDto } from './dto/fitting-list-query.dto.js';
import { FittingDto, StartedFittingDto } from './dto/fitting.dto.js';
import { RegenerateFittingDto } from './dto/regenerate-fitting.dto.js';
import { StartFittingDto } from './dto/start-fitting.dto.js';
import { FittingsService, type StartResult } from './fittings.service.js';

const STARTED = 'A new fitting, `pending`: the workflow makes the picture; poll GET /fittings/:id.';
const FOUND =
  'An earlier completed result of the same photo, items and text (`repeated: true`, nothing spent), or the running fitting of this request (A32).';

// The signed-in user's try-ons (spec 0019 plan §5). As /me, the starts sign a deleted user's
// cached session out with 401 (spec 0013 N31, N38); reads and deletes of a gone user find nothing
// (404).
@ApiTags('fittings')
@Controller('fittings')
@SignedIn()
export class FittingsController {
  constructor(
    private readonly fittings: FittingsService,
    private readonly me: MeService,
  ) {}

  // A text that the check does not answer in time is 503 with nothing stored (A45).
  @Post()
  @Expensive()
  @ApiCreatedResponse({ type: StartedFittingDto, description: STARTED })
  @ApiOkResponse({ type: StartedFittingDto, description: FOUND })
  @ApiErrors('RELATED_NOT_FOUND', 'LIMIT_REACHED', 'PROMPT_REFUSED')
  start(
    @CurrentUserId() userId: string,
    @Body() dto: StartFittingDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StartedFittingDto> {
    return this.answer(res, () => this.fittings.start(userId, dto));
  }

  @Get()
  @ApiCursorPaginatedResponse(FittingDto)
  list(
    @CurrentUserId() userId: string,
    @Query() query: FittingListQueryDto,
  ): Promise<CursorPaginated<FittingDto>> {
    return this.fittings.list(userId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: FittingDto })
  get(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<FittingDto> {
    return this.fittings.get(userId, id);
  }

  // The first regeneration of a result is free, the next ones spend a try-on (A6).
  @Post(':id/regenerate')
  @Expensive()
  @ApiCreatedResponse({ type: StartedFittingDto, description: STARTED })
  @ApiOkResponse({
    type: StartedFittingDto,
    description: 'The running regeneration of this result (A32).',
  })
  @ApiErrors('LIMIT_REACHED', 'PROMPT_REFUSED', 'PHOTO_GONE', 'NOT_COMPLETED')
  regenerate(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
    @Body() dto: RegenerateFittingDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StartedFittingDto> {
    return this.answer(res, () => this.fittings.regenerate(userId, id, dto));
  }

  // A running fitting is cancelled and keeps its try-on spent (A47).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'The fitting and its files are gone; its try-on stays spent.',
  })
  delete(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<void> {
    return this.fittings.delete(userId, id);
  }

  // 201 for a new fitting, 200 for one found.
  private async answer(res: Response, run: () => Promise<StartResult>): Promise<StartedFittingDto> {
    const { fitting, created } = await signOutWhenGone(res, () => this.me.sessionCookies(), run);
    if (!res.headersSent) {
      res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    }
    return fitting;
  }
}
