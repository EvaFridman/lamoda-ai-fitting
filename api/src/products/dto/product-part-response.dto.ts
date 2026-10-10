import { ApiProperty } from '@nestjs/swagger';

import { ProductAttributeRefDto, ProductAttributeValueRefDto } from './product-response.dto.js';

// The parts of a product return their own columns plus `productId` (spec 0004 E44). Image `url` is
// the full address under MEDIA_BASE_URL (E8).

export class ProductImageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'products/1/1.jpg' })
  imageKey: string;

  @ApiProperty({ format: 'uri', example: 'https://lamoda-ai-fitting.ru/media/products/1/1.jpg' })
  url: string;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ProductVariationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'M' })
  size: string;

  @ApiProperty({ minimum: 0 })
  stock: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ProductAttributeValueResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ format: 'uuid' })
  attributeValueId: string;

  @ApiProperty({ type: ProductAttributeRefDto })
  attribute: ProductAttributeRefDto;

  @ApiProperty({ type: ProductAttributeValueRefDto })
  value: ProductAttributeValueRefDto;

  @ApiProperty()
  createdAt: Date;
}
