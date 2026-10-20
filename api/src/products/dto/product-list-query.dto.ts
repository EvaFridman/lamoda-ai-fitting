import { ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min, ValidateBy } from 'class-validator';

import { MAX_OFFSET, PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { decodeProductCursor } from '../listing/product-cursor.js';
import { PRODUCT_SORTS, type ProductSort } from '../listing/product-sort.js';
import { ProductFilterQueryDto } from './product-filter-query.dto.js';

// The product list: its filters, paging and sort (spec 0004 E13–E15, E45). It pages by `cursor`
// (spec 0014 O11); `offset` stays until the web that uses the cursor is deployed (plan §4).
export class ProductListQueryDto extends IntersectionType(
  PickType(PaginationQueryDto, ['limit'] as const),
  ProductFilterQueryDto,
) {
  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'new' })
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'new';

  @ApiPropertyOptional({
    description:
      '`nextCursor` of the previous batch, made with the same sort; left out for the first batch.',
  })
  @IsOptional()
  @IsProductCursor()
  cursor?: string;

  // No default, unlike the other lists: a sent `offset` is told from one left out (O54).
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_OFFSET, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  @IsNotWithCursor()
  offset?: number;
}

// Code INVALID_CURSOR (O54); the message never repeats the cursor. Not checked while `sort` is
// unknown: that is the one error, told by `sort`'s own detail.
function IsProductCursor(): PropertyDecorator {
  return ValidateBy({
    name: 'invalidCursor',
    validator: {
      validate: (value: unknown, args) => {
        const { sort } = args?.object as ProductListQueryDto;
        return !PRODUCT_SORTS.includes(sort) || decodeProductCursor(value, sort) !== null;
      },
      defaultMessage: () => '$property must be the nextCursor of a batch with the same sort',
    },
  });
}

function IsNotWithCursor(): PropertyDecorator {
  return ValidateBy({
    name: 'notWithCursor',
    validator: {
      validate: (_value: unknown, args) =>
        (args?.object as ProductListQueryDto).cursor === undefined,
      defaultMessage: () => '$property must not be sent with cursor',
    },
  });
}
