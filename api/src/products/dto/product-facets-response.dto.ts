import { ApiProperty } from '@nestjs/swagger';

// The filter counts (spec 0004 E16, E46): for each value, the products the list would return with
// that value chosen as well. A value is listed while its count is above 0 or it is chosen.

export class FacetPriceDto {
  @ApiProperty({ example: 1999.99 })
  min: number;

  @ApiProperty({ example: 25_990 })
  max: number;
}

export class FacetCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Платья' })
  name: string;

  @ApiProperty({ minimum: 0 })
  count: number;
}

export class FacetBrandDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Calzetti' })
  name: string;

  @ApiProperty({ minimum: 0 })
  count: number;
}

export class FacetSizeDto {
  @ApiProperty({ example: 'M' })
  size: string;

  @ApiProperty({ minimum: 0 })
  count: number;
}

export class FacetAttributeValueDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Чёрный' })
  value: string;

  @ApiProperty({ minimum: 0 })
  count: number;
}

export class FacetAttributeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Цвет' })
  name: string;

  @ApiProperty({ type: [FacetAttributeValueDto] })
  values: FacetAttributeValueDto[];
}

export class ProductFacetsDto {
  @ApiProperty({ minimum: 0, description: 'Products matching every filter: the list `total`.' })
  total: number;

  @ApiProperty({ minimum: 0, description: 'Products with a discount, without `hasDiscount`.' })
  discounted: number;

  @ApiProperty({
    type: FacetPriceDto,
    nullable: true,
    description:
      'Lowest and highest price before the discount, without `minPrice` and `maxPrice`; ' +
      'null when no product matches.',
  })
  price: FacetPriceDto | null;

  @ApiProperty({ type: [FacetCategoryDto] })
  categories: FacetCategoryDto[];

  @ApiProperty({ type: [FacetBrandDto] })
  brands: FacetBrandDto[];

  @ApiProperty({ type: [FacetSizeDto], description: 'Sizes in stock.' })
  sizes: FacetSizeDto[];

  @ApiProperty({ type: [FacetAttributeDto] })
  attributes: FacetAttributeDto[];
}
