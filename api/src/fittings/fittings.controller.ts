import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
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
import { resultFileName } from './result-file-name.js';

// Every result in the bucket is a WebP image (spec 0011 M7).
const RESULT_TYPE = 'image/webp';
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

  // The history page was opened (spec 0024 plan §3.2, Z18). No `POST /fittings/:id` exists, so
  // nothing else matches `seen`.
  @Post('seen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Every completed fitting of the user's is seen." })
  markAllSeen(@CurrentUserId() userId: string): Promise<void> {
    return this.fittings.markAllSeen(userId);
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

  // «Скачать» (spec 0023 Y8): the result as a file from the site's own origin. The handler returns
  // once the bytes are read; the timeout does not reach the writing of the answer (plan §3.2).
  @Get(':id/image')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces(RESULT_TYPE)
  @ApiOkResponse({
    schema: { type: 'string', format: 'binary' },
    description: "The completed fitting's result, as an attachment named by its Moscow time.",
  })
  async image(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
  ): Promise<StreamableFile> {
    const { bytes, finishedAt } = await this.fittings.resultImage(userId, id);
    return new StreamableFile(bytes, {
      type: RESULT_TYPE,
      disposition: `attachment; filename="${resultFileName(finishedAt)}"`,
      length: bytes.byteLength,
    });
  }

  // The result was opened (Z18). Reads never mark it: `GET /fittings/:id` is polled and
  // prefetched, so a read does not mean the user saw it.
  @Post(':id/seen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'A completed fitting is seen from now on; one not completed is left as it is.',
  })
  markSeen(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<void> {
    return this.fittings.markSeen(userId, id);
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
