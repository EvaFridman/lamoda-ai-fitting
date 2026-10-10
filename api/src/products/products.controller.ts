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

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductListQueryDto } from './dto/product-list-query.dto.js';
import { ProductDetailDto, ProductListItemDto } from './dto/product-response.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsService } from './products.service.js';

// Reads are public, writes need the admin token (spec 0004 E1).
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiPaginatedResponse(ProductListItemDto)
  list(@Query() query: ProductListQueryDto): Promise<Paginated<ProductListItemDto>> {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDetailDto })
  get(@UuidParam('id') id: string): Promise<ProductDetailDto> {
    return this.products.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: ProductDetailDto })
  create(@Body() dto: CreateProductDto): Promise<ProductDetailDto> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOkResponse({ type: ProductDetailDto })
  update(@UuidParam('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductDetailDto> {
    return this.products.update(id, dto);
  }

  // The seed adds missing products on every deploy (spec 0002 C16, C16b; 0004 plan "Risks").
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Deletes the product with its images, sizes and attribute links. A product used in a ' +
      'generation cannot be deleted (409 IN_USE). A product of the demo catalog comes back on ' +
      'the next deploy: the seed re-creates missing products, with their images, sizes and ' +
      'attribute links.',
  })
  @ApiNoContentResponse()
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.products.delete(id);
  }
}
