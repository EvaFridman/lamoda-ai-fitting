import { ApiProperty } from '@nestjs/swagger';

import { ATTRIBUTE_VALUE_MAX_LENGTH, IsTrimmedText } from '../../common/validation/rules.js';

// The attribute comes from the path, never from the body (spec 0004 E42).
export class CreateAttributeValueDto {
  @ApiProperty({ example: 'чёрный', maxLength: ATTRIBUTE_VALUE_MAX_LENGTH })
  @IsTrimmedText(ATTRIBUTE_VALUE_MAX_LENGTH)
  value: string;
}
