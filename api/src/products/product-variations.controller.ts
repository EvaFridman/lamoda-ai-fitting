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
import { CreateProductVariationDto } from './dto/create-product-variation.dto.js';
import { ProductVariationResponseDto } from './dto/product-part-response.dto.js';
import { UpdateProductVariationDto } from './dto/update-product-variation.dto.js';
import { ProductVariationsService } from './product-variations.service.js';

// The sizes of a product with their stock, nested under it (spec 0004 E3, E44). Reads are public,
// writes are closed to everyone (spec 0013 N8).
@ApiTags('products')
@Controller('products/:id/variations')
export class ProductVariationsController {
  constructor(private readonly variations: ProductVariationsService) {}

  @Get()
  @Public()
  @ApiPaginatedResponse(ProductVariationResponseDto)
  list(
    @UuidParam('id') productId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ProductVariationResponseDto>> {
    return this.variations.list(productId, query);
  }

  @Get(':variationId')
  @Public()
  @ApiOkResponse({ type: ProductVariationResponseDto })
  get(
    @UuidParam('id') productId: string,
    @UuidParam('variationId') id: string,
  ): Promise<ProductVariationResponseDto> {
    return this.variations.get(productId, id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: ProductVariationResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(
    @UuidParam('id') productId: string,
    @Body() dto: CreateProductVariationDto,
  ): Promise<ProductVariationResponseDto> {
    return this.variations.create(productId, dto);
  }

  @Patch(':variationId')
  @Closed()
  @ApiOkResponse({ type: ProductVariationResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(
    @UuidParam('id') productId: string,
    @UuidParam('variationId') id: string,
    @Body() dto: UpdateProductVariationDto,
  ): Promise<ProductVariationResponseDto> {
    return this.variations.update(productId, id, dto);
  }

  @Delete(':variationId')
  @Closed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') productId: string, @UuidParam('variationId') id: string): Promise<void> {
    return this.variations.delete(productId, id);
  }
}
