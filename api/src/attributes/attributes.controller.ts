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
import { Closed, Public } from '../common/auth/access.decorators.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { AttributesService } from './attributes.service.js';
import { AttributeResponseDto } from './dto/attribute-response.dto.js';
import { CreateAttributeDto } from './dto/create-attribute.dto.js';
import { UpdateAttributeDto } from './dto/update-attribute.dto.js';

// Reads are public, writes are closed to everyone (spec 0013 N8).
@ApiTags('attributes')
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  @Public()
  @ApiPaginatedResponse(AttributeResponseDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<AttributeResponseDto>> {
    return this.attributes.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: AttributeResponseDto })
  get(@UuidParam('id') id: string): Promise<AttributeResponseDto> {
    return this.attributes.get(id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: AttributeResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(@Body() dto: CreateAttributeDto): Promise<AttributeResponseDto> {
    return this.attributes.create(dto);
  }

  @Patch(':id')
  @Closed()
  @ApiOkResponse({ type: AttributeResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(
    @UuidParam('id') id: string,
    @Body() dto: UpdateAttributeDto,
  ): Promise<AttributeResponseDto> {
    return this.attributes.update(id, dto);
  }

  @Delete(':id')
  @Closed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrors('IN_USE')
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.attributes.delete(id);
  }
}
