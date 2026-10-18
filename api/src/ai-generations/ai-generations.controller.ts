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
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { AiGenerationsService } from './ai-generations.service.js';
import { AiGenerationListQueryDto } from './dto/ai-generation-list-query.dto.js';
import { AiGenerationResponseDto } from './dto/ai-generation-response.dto.js';
import { CreateAiGenerationDto } from './dto/create-ai-generation.dto.js';
import { UpdateAiGenerationDto } from './dto/update-ai-generation.dto.js';

// Reads and deletion need a signed-in user and serve only the generations of that user's sessions;
// the writes are the generation workflow's, closed to everyone (spec 0013 N8).
@ApiTags('ai-generations')
@Controller('ai-generations')
export class AiGenerationsController {
  constructor(private readonly generations: AiGenerationsService) {}

  @Get()
  @SignedIn()
  @ApiPaginatedResponse(AiGenerationResponseDto)
  list(
    @CurrentUserId() userId: string,
    @Query() query: AiGenerationListQueryDto,
  ): Promise<Paginated<AiGenerationResponseDto>> {
    return this.generations.list(userId, query);
  }

  @Get(':id')
  @SignedIn()
  @ApiOkResponse({ type: AiGenerationResponseDto })
  get(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
  ): Promise<AiGenerationResponseDto> {
    return this.generations.get(userId, id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: AiGenerationResponseDto })
  @ApiErrors('RELATED_NOT_FOUND')
  create(@Body() dto: CreateAiGenerationDto): Promise<AiGenerationResponseDto> {
    return this.generations.create(dto);
  }

  @Patch(':id')
  @Closed()
  @ApiOkResponse({ type: AiGenerationResponseDto })
  @ApiErrors('RELATED_NOT_FOUND', 'CONSTRAINT_VIOLATION')
  update(
    @UuidParam('id') id: string,
    @Body() dto: UpdateAiGenerationDto,
  ): Promise<AiGenerationResponseDto> {
    return this.generations.update(id, dto);
  }

  @Delete(':id')
  @SignedIn()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<void> {
    return this.generations.delete(userId, id);
  }
}
