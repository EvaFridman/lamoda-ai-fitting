import { ApiProperty } from '@nestjs/swagger';

import { IsTrimmedText, NAME_MAX_LENGTH } from '../../common/validation/rules.js';

export class CreateBrandDto {
  @ApiProperty({ example: 'Lamoda', maxLength: NAME_MAX_LENGTH })
  @IsTrimmedText(NAME_MAX_LENGTH)
  name: string;
}
