import { ApiProperty } from '@nestjs/swagger';

import { IsSlug, SLUG, SLUG_MAX_LENGTH } from '../../common/validation/rules.js';

// A slug in the path: anything that breaks the slug rule answers 400 VALIDATION_FAILED on `slug`
// (spec 0014 plan §2.5, O55).
export class CategorySlugParamDto {
  @ApiProperty({ example: 'dresses', maxLength: SLUG_MAX_LENGTH, pattern: SLUG.source })
  @IsSlug()
  slug: string;
}
