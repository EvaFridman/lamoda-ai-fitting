import { PartialType } from '@nestjs/swagger';

import { CreateAttributeDto } from './create-attribute.dto.js';

// Partial (spec 0004 E4); null is refused (E40).
export class UpdateAttributeDto extends PartialType(CreateAttributeDto, {
  skipNullProperties: false,
}) {}
