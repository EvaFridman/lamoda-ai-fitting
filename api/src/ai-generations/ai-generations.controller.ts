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
import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { AiGenerationsService } from './ai-generations.service.js';
import { AiGenerationListQueryDto } from './dto/ai-generation-list-query.dto.js';
import { AiGenerationResponseDto } from './dto/ai-generation-response.dto.js';
import { CreateAiGenerationDto } from './dto/create-ai-generation.dto.js';
import { UpdateAiGenerationDto } from './dto/update-ai-generation.dto.js';

// Every route, reads included, needs the admin token (spec 0004 E1).
@ApiTags('ai-generations')
@Controller('ai-generations')
@AdminOnly()
export class AiGenerationsController {
  constructor(private readonly generations: AiGenerationsService) {}

  @Get()
  @ApiPaginatedResponse(AiGenerationResponseDto)
  list(@Query() query: AiGenerationListQueryDto): Promise<Paginated<AiGenerationResponseDto>> {
    return this.generations.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AiGenerationResponseDto })
  get(@UuidParam('id') id: string): Promise<AiGenerationResponseDto> {
    return this.generations.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: AiGenerationResponseDto })
  @ApiErrors('RELATED_NOT_FOUND')
  create(@Body() dto: CreateAiGenerationDto): Promise<AiGenerationResponseDto> {
    return this.generations.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AiGenerationResponseDto })
  @ApiErrors('RELATED_NOT_FOUND', 'CONSTRAINT_VIOLATION')
  update(
    @UuidParam('id') id: string,
    @Body() dto: UpdateAiGenerationDto,
  ): Promise<AiGenerationResponseDto> {
    return this.generations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.generations.delete(id);
  }
}
