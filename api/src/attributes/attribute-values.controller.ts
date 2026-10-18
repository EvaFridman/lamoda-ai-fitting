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
import { AttributeValuesService } from './attribute-values.service.js';
import { AttributeValueResponseDto } from './dto/attribute-value-response.dto.js';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto.js';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto.js';

// The values of an attribute, nested under it (spec 0004 E3). Reads are public, writes are
// closed to everyone (spec 0013 N8).
@ApiTags('attributes')
@Controller('attributes/:id/values')
export class AttributeValuesController {
  constructor(private readonly values: AttributeValuesService) {}

  @Get()
  @Public()
  @ApiPaginatedResponse(AttributeValueResponseDto)
  list(
    @UuidParam('id') attributeId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AttributeValueResponseDto>> {
    return this.values.list(attributeId, query);
  }

  @Get(':valueId')
  @Public()
  @ApiOkResponse({ type: AttributeValueResponseDto })
  get(
    @UuidParam('id') attributeId: string,
    @UuidParam('valueId') id: string,
  ): Promise<AttributeValueResponseDto> {
    return this.values.get(attributeId, id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: AttributeValueResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(
    @UuidParam('id') attributeId: string,
    @Body() dto: CreateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.create(attributeId, dto);
  }

  @Patch(':valueId')
  @Closed()
  @ApiOkResponse({ type: AttributeValueResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(
    @UuidParam('id') attributeId: string,
    @UuidParam('valueId') id: string,
    @Body() dto: UpdateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.update(attributeId, id, dto);
  }

  @Delete(':valueId')
  @Closed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrors('IN_USE')
  delete(@UuidParam('id') attributeId: string, @UuidParam('valueId') id: string): Promise<void> {
    return this.values.delete(attributeId, id);
  }
}
