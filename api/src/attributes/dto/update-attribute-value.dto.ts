import { PartialType } from '@nestjs/swagger';

import { CreateAttributeValueDto } from './create-attribute-value.dto.js';

// Partial (spec 0004 E4); null is refused (E40). No `attributeId`: a value never moves (E42).
export class UpdateAttributeValueDto extends PartialType(CreateAttributeValueDto, {
  skipNullProperties: false,
}) {}
