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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrors } from '../common/errors/api-errors.decorator.js';
import { Closed, Public } from '../common/auth/access.decorators.js';
import {
  ApiCursorPaginatedResponse,
  type CursorPaginated,
} from '../common/pagination/cursor-paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductFacetsDto } from './dto/product-facets-response.dto.js';
import { ProductFilterQueryDto } from './dto/product-filter-query.dto.js';
import { ProductListQueryDto } from './dto/product-list-query.dto.js';
import { ProductDetailDto, ProductListItemDto } from './dto/product-response.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsService } from './products.service.js';

// Reads are public, writes are closed to everyone (spec 0013 N8).
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Public()
  @ApiCursorPaginatedResponse(ProductListItemDto)
  list(@Query() query: ProductListQueryDto): Promise<CursorPaginated<ProductListItemDto>> {
    return this.products.list(query);
  }

  // Declared before `:id`, which would take `facets` for an id.
  @Get('facets')
  @Public()
  @ApiOperation({
    description:
      'Filter counts: for each category, brand, size in stock and attribute value, the number of ' +
      'products the list would return with that value chosen as well. Takes the list filters only.',
  })
  @ApiOkResponse({ type: ProductFacetsDto })
  facets(@Query() query: ProductFilterQueryDto): Promise<ProductFacetsDto> {
    return this.products.facets(query);
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: ProductDetailDto })
  get(@UuidParam('id') id: string): Promise<ProductDetailDto> {
    return this.products.get(id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: ProductDetailDto })
  @ApiErrors('ALREADY_EXISTS', 'RELATED_NOT_FOUND')
  create(@Body() dto: CreateProductDto): Promise<ProductDetailDto> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Closed()
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiErrors('ALREADY_EXISTS', 'RELATED_NOT_FOUND')
  update(@UuidParam('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductDetailDto> {
    return this.products.update(id, dto);
  }

  // The seed adds missing products on every deploy (spec 0002 C16, C16b; 0004 plan "Risks").
  @Delete(':id')
  @Closed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Deletes the product with its images, sizes and attribute links. A product used in a ' +
      'generation cannot be deleted (409 IN_USE). A product of the demo catalog comes back on ' +
      'the next deploy: the seed re-creates missing products, with their images, sizes and ' +
      'attribute links.',
  })
  @ApiNoContentResponse()
  @ApiErrors('IN_USE')
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.products.delete(id);
  }
}
