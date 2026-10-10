import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { AttributesService } from './attributes.service.js';
import { AttributeResponseDto } from './dto/attribute-response.dto.js';
import { CreateAttributeDto } from './dto/create-attribute.dto.js';
import { UpdateAttributeDto } from './dto/update-attribute.dto.js';

// Reads are public, writes need the admin token (spec 0004 E1).
@ApiTags('attributes')
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  @ApiPaginatedResponse(AttributeResponseDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<AttributeResponseDto>> {
    return this.attributes.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AttributeResponseDto })
  get(@Param('id', UuidPipe) id: string): Promise<AttributeResponseDto> {
    return this.attributes.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: AttributeResponseDto })
  create(@Body() dto: CreateAttributeDto): Promise<AttributeResponseDto> {
    return this.attributes.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOkResponse({ type: AttributeResponseDto })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateAttributeDto,
  ): Promise<AttributeResponseDto> {
    return this.attributes.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@Param('id', UuidPipe) id: string): Promise<void> {
    return this.attributes.delete(id);
  }
}
