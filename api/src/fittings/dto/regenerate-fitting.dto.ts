import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
} from 'class-validator';

import { REGENERATION_REASONS, type RegenerationReason } from '../../ai/prompts.js';
import { IsFreeText } from '../../common/validation/rules.js';
import { COMMENT_MAX_LENGTH, trimText } from './fitting-text.js';

// The body of POST /fittings/:id/regenerate (spec 0019 plan §5): what went wrong (A16's chips,
// «Что поменять?»), at least one, and a comment.
export class RegenerateFittingDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', enum: [...REGENERATION_REASONS] },
    minItems: 1,
    maxItems: REGENERATION_REASONS.length,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(REGENERATION_REASONS.length)
  @ArrayUnique()
  @IsIn(REGENERATION_REASONS, { each: true })
  reasons: RegenerationReason[];

  @ApiPropertyOptional({
    maxLength: COMMENT_MAX_LENGTH,
    description: 'The comment on the result, trimmed; blank is none.',
  })
  @Transform(trimText)
  @IsOptional()
  @IsFreeText(COMMENT_MAX_LENGTH)
  comment?: string;
}
