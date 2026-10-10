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
import { CreateProductImageDto } from './dto/create-product-image.dto.js';
import { ProductImageResponseDto } from './dto/product-part-response.dto.js';
import { UpdateProductImageDto } from './dto/update-product-image.dto.js';
import { ProductImagesService } from './product-images.service.js';

// The images of a product, nested under it (spec 0004 E3, E44). Reads are public, writes need the
// admin token (E1).
@ApiTags('products')
@Controller('products/:id/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Get()
  @ApiPaginatedResponse(ProductImageResponseDto)
  list(
    @UuidParam('id') productId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ProductImageResponseDto>> {
    return this.images.list(productId, query);
  }

  @Get(':imageId')
  @ApiOkResponse({ type: ProductImageResponseDto })
  get(
    @UuidParam('id') productId: string,
    @UuidParam('imageId') id: string,
  ): Promise<ProductImageResponseDto> {
    return this.images.get(productId, id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: ProductImageResponseDto })
  create(
    @UuidParam('id') productId: string,
    @Body() dto: CreateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.images.create(productId, dto);
  }

  @Patch(':imageId')
  @AdminOnly()
  @ApiOkResponse({ type: ProductImageResponseDto })
  update(
    @UuidParam('id') productId: string,
    @UuidParam('imageId') id: string,
    @Body() dto: UpdateProductImageDto,
  ): Promise<ProductImageResponseDto> {
    return this.images.update(productId, id, dto);
  }

  @Delete(':imageId')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') productId: string, @UuidParam('imageId') id: string): Promise<void> {
    return this.images.delete(productId, id);
  }
}
