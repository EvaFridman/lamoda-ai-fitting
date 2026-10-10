import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto.js';
import { ProductAttributeValueResponseDto } from './dto/product-part-response.dto.js';
import { ProductAttributeValuesService } from './product-attribute-values.service.js';

// The attribute values linked to a product, nested under it; a link is added and removed, never
// updated (spec 0004 E3, E44). Reads are public, writes need the admin token (E1).
@ApiTags('products')
@Controller('products/:id/attribute-values')
export class ProductAttributeValuesController {
  constructor(private readonly links: ProductAttributeValuesService) {}

  @Get()
  @ApiPaginatedResponse(ProductAttributeValueResponseDto)
  list(
    @UuidParam('id') productId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ProductAttributeValueResponseDto>> {
    return this.links.list(productId, query);
  }

  @Get(':attributeValueId')
  @ApiOkResponse({ type: ProductAttributeValueResponseDto })
  get(
    @UuidParam('id') productId: string,
    @UuidParam('attributeValueId') attributeValueId: string,
  ): Promise<ProductAttributeValueResponseDto> {
    return this.links.get(productId, attributeValueId);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: ProductAttributeValueResponseDto })
  create(
    @UuidParam('id') productId: string,
    @Body() dto: CreateProductAttributeValueDto,
  ): Promise<ProductAttributeValueResponseDto> {
    return this.links.create(productId, dto);
  }

  @Delete(':attributeValueId')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(
    @UuidParam('id') productId: string,
    @UuidParam('attributeValueId') attributeValueId: string,
  ): Promise<void> {
    return this.links.delete(productId, attributeValueId);
  }
}
