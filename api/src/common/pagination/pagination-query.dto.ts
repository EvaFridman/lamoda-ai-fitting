import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 60;
export const MAX_PAGE_SIZE = 100;
// Prisma's `skip` is a 32-bit integer: a larger offset would fail in the query as a 500, not 400.
export const MAX_OFFSET = 2_147_483_647;

// `?limit=&offset=` of every list (spec 0004 E5): 60 items by default, as on lamoda, at most 100.
// List query DTOs extend it with their filters.
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_OFFSET, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  offset: number = 0;
}
