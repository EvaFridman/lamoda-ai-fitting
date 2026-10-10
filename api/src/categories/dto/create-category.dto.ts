import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import {
  DESCRIPTION_MAX_LENGTH,
  IsDescription,
  IsNonNegativeInt,
  IsOmittable,
  IsSlug,
  IsTrimmedText,
  MAX_INT,
  NAME_MAX_LENGTH,
  SLUG,
  SLUG_MAX_LENGTH,
} from '../../common/validation/rules.js';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Платья', maxLength: NAME_MAX_LENGTH })
  @IsTrimmedText(NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({ example: 'dresses', maxLength: SLUG_MAX_LENGTH, pattern: SLUG.source })
  @IsSlug()
  slug: string;

  // Required: the column has no default (spec 0004 E40).
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsDescription()
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_INT, default: 0 })
  @IsOmittable()
  @IsNonNegativeInt()
  sortOrder?: number;
}
