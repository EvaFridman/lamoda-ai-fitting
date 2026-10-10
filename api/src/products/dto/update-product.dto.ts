import { PartialType } from '@nestjs/swagger';

import { CreateProductDto } from './create-product.dto.js';

// Partial (spec 0004 E4); null is refused except for `description` and `rating`, which it clears
// (E43).
export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
