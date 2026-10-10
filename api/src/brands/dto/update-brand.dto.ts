import { PartialType } from '@nestjs/swagger';

import { CreateBrandDto } from './create-brand.dto.js';

// Partial (spec 0004 E4); null is refused (E40).
export class UpdateBrandDto extends PartialType(CreateBrandDto, { skipNullProperties: false }) {}
