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
    @Param('id', UuidPipe) attributeId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AttributeValueResponseDto>> {
    return this.values.list(attributeId, query);
  }

  @Get(':valueId')
  @ApiOkResponse({ type: AttributeValueResponseDto })
  get(
    @Param('id', UuidPipe) attributeId: string,
    @Param('valueId', UuidPipe) id: string,
  ): Promise<AttributeValueResponseDto> {
    return this.values.get(attributeId, id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: AttributeValueResponseDto })
  create(
    @Param('id', UuidPipe) attributeId: string,
    @Body() dto: CreateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.create(attributeId, dto);
  }

  @Patch(':valueId')
  @AdminOnly()
  @ApiOkResponse({ type: AttributeValueResponseDto })
  update(
    @Param('id', UuidPipe) attributeId: string,
    @Param('valueId', UuidPipe) id: string,
    @Body() dto: UpdateAttributeValueDto,
  ): Promise<AttributeValueResponseDto> {
    return this.values.update(attributeId, id, dto);
  }

  @Delete(':valueId')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(
    @Param('id', UuidPipe) attributeId: string,
    @Param('valueId', UuidPipe) id: string,
  ): Promise<void> {
    return this.values.delete(attributeId, id);
  }
}
