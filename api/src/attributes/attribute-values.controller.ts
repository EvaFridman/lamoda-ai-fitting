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
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { AttributeValuesService } from './attribute-values.service.js';
import { AttributeValueResponseDto } from './dto/attribute-value-response.dto.js';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto.js';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto.js';

// The values of an attribute, nested under it (spec 0004 E3). Reads are public, writes need the
// admin token (E1).
@ApiTags('attributes')
@Controller('attributes/:id/values')
export class AttributeValuesController {
  constructor(private readonly values: AttributeValuesService) {}

  @Get()
  @ApiPaginatedResponse(AttributeValueResponseDto)
  list(
    @UuidParam('id') attributeId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AttributeValueResponseDto>> {
    return this.values.list(attributeId, query);
  }

  @Get(':valueId')
  @ApiOkResponse({ type: AttributeValueResponseDto })
  get(
    @UuidParam('id') attributeId: string,
    @UuidParam('valueId') id: string,
  ): Promise<AttributeValueResponseDto> {
    return this.values.get(attributeId, id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: AttributeValueResponseDto })
  create(
    @UuidParam('id') attributeId: string,
    @Body() dto: CreateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.create(attributeId, dto);
  }

  @Patch(':valueId')
  @AdminOnly()
  @ApiOkResponse({ type: AttributeValueResponseDto })
  update(
    @UuidParam('id') attributeId: string,
    @UuidParam('valueId') id: string,
    @Body() dto: UpdateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.update(attributeId, id, dto);
  }

  @Delete(':valueId')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') attributeId: string, @UuidParam('valueId') id: string): Promise<void> {
    return this.values.delete(attributeId, id);
  }
}
