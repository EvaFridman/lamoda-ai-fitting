import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import {
  IsBooleanQuery,
  IsListQuery,
  IsNotBelow,
  IsPriceQuery,
  IsTrimmedText,
  MAX_PRICE,
  MAX_QUERY_LIST_VALUES,
  SEARCH_MAX_LENGTH,
  SIZE_MAX_LENGTH,
} from '../../common/validation/rules.js';

const LIST = `Repeated keys or a comma list, at most ${MAX_QUERY_LIST_VALUES} values; any of them matches.`;

// The filters of the product list and its filter counts (spec 0004 E13, E17, E45). Filters left
// out do not filter; given ones narrow the list together.
export class ProductFilterQueryDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: LIST })
  @IsOptional()
  @IsListQuery()
  @IsUUID(undefined, { each: true })
  categoryId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: LIST })
  @IsOptional()
  @IsListQuery()
  @IsUUID(undefined, { each: true })
  brandId?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: `${LIST} Only sizes in stock count.`,
    example: ['M'],
  })
  @IsOptional()
  @IsListQuery()
  @IsTrimmedText(SIZE_MAX_LENGTH, { each: true })
  size?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: `${LIST} Values of one attribute widen the list, of different attributes narrow it.`,
  })
  @IsOptional()
  @IsListQuery()
  @IsUUID(undefined, { each: true })
  attributeValueId?: string[];

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: SEARCH_MAX_LENGTH,
    description: 'Part of the name, case ignored.',
  })
  @IsOptional()
  @IsTrimmedText(SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_PRICE,
    description: 'Price before the discount, inclusive.',
  })
  @IsOptional()
  @IsPriceQuery()
  minPrice?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_PRICE,
    description: 'Price before the discount, inclusive; not below minPrice.',
  })
  @IsOptional()
  @IsPriceQuery()
  @IsNotBelow('minPrice')
  maxPrice?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: only discounted products; false: only those without a discount.',
  })
  @IsOptional()
  @IsBooleanQuery()
  hasDiscount?: boolean;
}
