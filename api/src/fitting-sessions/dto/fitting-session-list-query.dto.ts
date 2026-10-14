import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';

// Paging and one optional filter (spec 0004 E48). An empty or repeated `userId` fails IsUUID; a
// well-formed id of no user matches nothing.
export class FittingSessionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: "Only this user's sessions." })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
