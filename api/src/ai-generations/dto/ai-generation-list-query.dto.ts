import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';

// Paging and one optional filter (spec 0004 E51, as `userId` of E48). An empty or repeated
// `sessionId` fails IsUUID; a well-formed id of no session matches nothing.
export class AiGenerationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: "Only this session's generations." })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
