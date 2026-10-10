import { PartialType } from '@nestjs/swagger';

import { CreateProductImageDto } from './create-product-image.dto.js';

// Partial (spec 0004 E4); null is refused (E40). No `productId`: an image never moves (E44).
export class UpdateProductImageDto extends PartialType(CreateProductImageDto, {
  skipNullProperties: false,
}) {}
