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

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateFittingSessionDto } from './dto/create-fitting-session.dto.js';
import { FittingSessionListQueryDto } from './dto/fitting-session-list-query.dto.js';
import { FittingSessionResponseDto } from './dto/fitting-session-response.dto.js';
import { UpdateFittingSessionDto } from './dto/update-fitting-session.dto.js';
import { FittingSessionsService } from './fitting-sessions.service.js';

// Every route, reads included, needs the admin token (spec 0004 E1).
@ApiTags('fitting-sessions')
@Controller('fitting-sessions')
@AdminOnly()
export class FittingSessionsController {
  constructor(private readonly sessions: FittingSessionsService) {}

  @Get()
  @ApiPaginatedResponse(FittingSessionResponseDto)
  list(@Query() query: FittingSessionListQueryDto): Promise<Paginated<FittingSessionResponseDto>> {
    return this.sessions.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: FittingSessionResponseDto })
  get(@UuidParam('id') id: string): Promise<FittingSessionResponseDto> {
    return this.sessions.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: FittingSessionResponseDto })
  create(@Body() dto: CreateFittingSessionDto): Promise<FittingSessionResponseDto> {
    return this.sessions.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FittingSessionResponseDto })
  update(
    @UuidParam('id') id: string,
    @Body() dto: UpdateFittingSessionDto,
  ): Promise<FittingSessionResponseDto> {
    return this.sessions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.sessions.delete(id);
  }
}
