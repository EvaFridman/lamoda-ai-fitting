import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { PRODUCT_SORTS, type ProductSort } from '../listing/product-sort.js';
import { ProductFilterQueryDto } from './product-filter-query.dto.js';

// The product list: its filters, paging and sort (spec 0004 E13–E15, E45).
export class ProductListQueryDto extends IntersectionType(
  PaginationQueryDto,
  ProductFilterQueryDto,
) {
  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'new' })
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'new';
}
