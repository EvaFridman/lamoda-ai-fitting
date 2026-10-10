import { PartialType } from '@nestjs/swagger';

import { CreateCategoryDto } from './create-category.dto.js';

// Partial (spec 0004 E4); null is refused except for `description`, which it clears (E40).
export class UpdateCategoryDto extends PartialType(CreateCategoryDto, {
  skipNullProperties: false,
}) {}
