import { ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional, ValidateBy } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { decodeProductCursor } from '../listing/product-cursor.js';
import { PRODUCT_SORTS, type ProductSort } from '../listing/product-sort.js';
import { ProductFilterQueryDto } from './product-filter-query.dto.js';

// The product list: its filters, paging and sort (spec 0004 E13–E15, E45). It pages by `cursor`
// only (spec 0014 O11, plan §4): `offset` is an unknown parameter here, unlike the other lists.
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
