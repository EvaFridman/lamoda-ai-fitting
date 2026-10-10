import { ApiProperty } from '@nestjs/swagger';

// Shapes of spec 0004 E7, E8 and E43. Money and rating are JSON numbers (E6); image fields are full
// addresses under MEDIA_BASE_URL.

export class ProductBrandDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Lamoda' })
  name: string;
}

export class ProductCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Платья' })
  name: string;

  @ApiProperty({ example: 'dresses' })
  slug: string;
}

export class ProductCoverDto {
  @ApiProperty({ format: 'uri', example: 'https://lamoda-ai-fitting.ru/media/products/1/1.jpg' })
  url: string;
}

export class ProductListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'MP002XW0ABCD' })
  article: string;

  @ApiProperty({ example: 'Платье миди' })
  name: string;

  @ApiProperty({ type: ProductBrandDto })
  brand: ProductBrandDto;

  @ApiProperty({ type: ProductCategoryDto })
  category: ProductCategoryDto;

  // The first image by `sortOrder`, then id (E43); null when the product has none.
  @ApiProperty({ type: ProductCoverDto, nullable: true })
  image: ProductCoverDto | null;

  @ApiProperty({ example: 1999.99 })
  price: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 15 })
  discount: number;

  // The price after the discount, rounded down to whole rubles (E8).
  @ApiProperty({ example: 1699 })
  finalPrice: number;

  @ApiProperty({ type: Number, nullable: true, example: 4.5 })
  rating: number | null;

  @ApiProperty()
  createdAt: Date;
}

export class ProductImageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uri', example: 'https://lamoda-ai-fitting.ru/media/products/1/1.jpg' })
  url: string;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;
}

export class ProductVariationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'M' })
  size: string;

  @ApiProperty({ minimum: 0 })
  stock: number;
}

export class ProductAttributeRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Цвет' })
  name: string;
}

export class ProductAttributeValueRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'чёрный' })
  value: string;
}

export class ProductAttributeDto {
  @ApiProperty({ type: ProductAttributeRefDto })
  attribute: ProductAttributeRefDto;

  @ApiProperty({ type: [ProductAttributeValueRefDto] })
  values: ProductAttributeValueRefDto[];
}

export class ProductDetailDto extends ProductListItemDto {
  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  // By `sortOrder`, then id (E43).
  @ApiProperty({ type: [ProductImageDto] })
  images: ProductImageDto[];

  // In the order they were added (E43).
  @ApiProperty({ type: [ProductVariationDto] })
  variations: ProductVariationDto[];

  // By attribute name, values by value (E43).
  @ApiProperty({ type: [ProductAttributeDto] })
  attributes: ProductAttributeDto[];
}
