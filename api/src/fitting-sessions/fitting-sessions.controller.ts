import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../common/errors/api-errors.decorator.js';
import { Closed, SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateFittingSessionDto } from './dto/create-fitting-session.dto.js';
import { FittingSessionResponseDto } from './dto/fitting-session-response.dto.js';
import { UpdateFittingSessionDto } from './dto/update-fitting-session.dto.js';
import { FittingSessionsService } from './fitting-sessions.service.js';

// The reads and the delete need a signed-in user and serve only that user's sessions (spec 0013
// N8); the writes are closed (spec 0019 A21).
@ApiTags('fitting-sessions')
@Controller('fitting-sessions')
@SignedIn()
export class FittingSessionsController {
  constructor(private readonly sessions: FittingSessionsService) {}

  @Get()
  @ApiPaginatedResponse(FittingSessionResponseDto)
  list(
    @CurrentUserId() userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<FittingSessionResponseDto>> {
    return this.sessions.list(userId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: FittingSessionResponseDto })
  get(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
  ): Promise<FittingSessionResponseDto> {
    return this.sessions.get(userId, id);
  }

  // Closed (spec 0019 A21): the server creates the one active session at the first try-on.
  @Post()
  @Closed()
  @ApiCreatedResponse({ type: FittingSessionResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateFittingSessionDto,
  ): Promise<FittingSessionResponseDto> {
    return this.sessions.create(userId, dto);
  }

  @Patch(':id')
  @Closed()
  @ApiOkResponse({ type: FittingSessionResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
    @Body() dto: UpdateFittingSessionDto,
  ): Promise<FittingSessionResponseDto> {
    return this.sessions.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<void> {
    return this.sessions.delete(userId, id);
  }
}
