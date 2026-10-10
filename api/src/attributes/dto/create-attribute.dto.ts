import { ApiProperty } from '@nestjs/swagger';

import { ATTRIBUTE_NAME_MAX_LENGTH, IsTrimmedText } from '../../common/validation/rules.js';

export class CreateAttributeDto {
  @ApiProperty({ example: 'Цвет', maxLength: ATTRIBUTE_NAME_MAX_LENGTH })
  @IsTrimmedText(ATTRIBUTE_NAME_MAX_LENGTH)
  name: string;
}
