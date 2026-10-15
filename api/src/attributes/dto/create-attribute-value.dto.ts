import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

import {
  ATTRIBUTE_VALUE_MAX_LENGTH,
  COLOR_HEX,
  IsColorHex,
  IsTrimmedText,
} from '../../common/validation/rules.js';

// The attribute comes from the path, never from the body (spec 0004 E42).
export class CreateAttributeValueDto {
  @ApiProperty({ example: 'чёрный', maxLength: ATTRIBUTE_VALUE_MAX_LENGTH })
  @IsTrimmedText(ATTRIBUTE_VALUE_MAX_LENGTH)
  value: string;

  // May be left out or `null`; `null` in an update clears it (spec 0009, K12).
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '#000000',
    pattern: COLOR_HEX.source,
    description: 'Swatch colour, `#RRGGBB`.',
  })
  @IsOptional()
  @IsColorHex()
  colorHex?: string | null;
}
