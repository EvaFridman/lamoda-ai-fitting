import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { IsBooleanQuery } from '../../common/validation/rules.js';

export class ListCategoriesQueryDto extends PaginationQueryDto {
  // Left out: every category (spec 0004 E39).
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBooleanQuery()
  isActive?: boolean;
}
