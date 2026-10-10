import { PartialType } from '@nestjs/swagger';

import { CreateProductVariationDto } from './create-product-variation.dto.js';

// Partial (spec 0004 E4); null is refused (E40). No `productId`: a size never moves (E44).
export class UpdateProductVariationDto extends PartialType(CreateProductVariationDto, {
  skipNullProperties: false,
}) {}
