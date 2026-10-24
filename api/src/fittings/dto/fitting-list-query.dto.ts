import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional, ValidateBy } from 'class-validator';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { FittingKind } from '../../generated/prisma/enums.js';
import { decodeFittingCursor } from '../fitting-cursor.js';

// `GET /fittings?kind=&cursor=&limit=` (spec 0019 plan §5): newest first, paged by cursor as the
// product list (spec 0014 O11), so `offset` is an unknown parameter here.
export class FittingListQueryDto extends PickType(PaginationQueryDto, ['limit'] as const) {
  @ApiPropertyOptional({ enum: FittingKind, enumName: 'FittingKind' })
  @IsOptional()
  @IsEnum(FittingKind)
  kind?: FittingKind;

  @ApiPropertyOptional({
    description: '`nextCursor` of the previous batch; left out for the first batch.',
  })
  @IsOptional()
  @IsFittingCursor()
  cursor?: string;
}

// Code INVALID_CURSOR, as the product list's; the message never repeats the cursor.
function IsFittingCursor(): PropertyDecorator {
  return ValidateBy({
    name: 'invalidCursor',
    validator: {
      validate: (value: unknown) => decodeFittingCursor(value) !== null,
      defaultMessage: () => '$property must be the nextCursor of a batch',
    },
  });
}
