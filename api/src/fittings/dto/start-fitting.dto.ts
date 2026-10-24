import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

import { MAX_FITTING_ITEMS } from '../../ai/image-models/image-model.js';
import { IsFreeText } from '../../common/validation/rules.js';
import { FittingKind } from '../../generated/prisma/enums.js';
import { trimText, WISHES_MAX_LENGTH } from './fitting-text.js';

// A look takes two items or more (spec 0019 A70); a single try-on one.
export const MIN_LOOK_ITEMS = 2;

// Ids come in any letter case; lower-cased once here, so the duplicate check, the fingerprint and
// the database see the same value.
function lowerCaseId({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

export class FittingItemDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(lowerCaseId)
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The colour: one of the product's attribute values. Left out, the product's own.",
  })
  @Transform(lowerCaseId)
  @IsOptional()
  @IsUUID()
  attributeValueId?: string;
}

// The items' count for one kind (A70), under the code of the array's own size rule, so web reads
// it the same. Not checked while `items` is not an array: its own detail says why.
function HasKindSize(
  kind: FittingKind,
  rule: 'arrayMinSize' | 'arrayMaxSize',
  size: number,
): PropertyDecorator {
  return ValidateBy({
    name: rule,
    constraints: [size],
    validator: {
      validate: (value: unknown, args) => {
        if ((args?.object as Partial<StartFittingDto>).kind !== kind || !Array.isArray(value)) {
          return true;
        }
        return rule === 'arrayMinSize' ? value.length >= size : value.length <= size;
      },
      defaultMessage: () =>
        `$property must contain ${rule === 'arrayMinSize' ? 'at least' : 'at most'} ${size} items for ${kind}`,
    },
  });
}

// The body of POST /fittings (spec 0019 plan §5, A70). The categories' slots (HAS_SLOT,
// DISTINCT_SLOTS) and the colours' products (RELATED_NOT_FOUND) are checked by the service, which
// reads them.
export class StartFittingDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A photo of «Мои фото» or a one-time one (`save=false`).',
  })
  @Transform(lowerCaseId)
  @IsUUID()
  photoId: string;

  @ApiProperty({ enum: FittingKind, enumName: 'FittingKind' })
  @IsEnum(FittingKind)
  kind: FittingKind;

  @ApiProperty({
    type: [FittingItemDto],
    minItems: 1,
    maxItems: MAX_FITTING_ITEMS,
    description: `One item for \`single\`, ${MIN_LOOK_ITEMS} to ${MAX_FITTING_ITEMS} of distinct slots for \`look\`; each product once.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FITTING_ITEMS)
  @ArrayUnique((item: unknown) =>
    typeof item === 'object' && item !== null ? (item as { productId?: unknown }).productId : item,
  )
  @ValidateNested({ each: true })
  @Type(() => FittingItemDto)
  @HasKindSize('single', 'arrayMaxSize', 1)
  @HasKindSize('look', 'arrayMinSize', MIN_LOOK_ITEMS)
  items: FittingItemDto[];

  @ApiPropertyOptional({
    maxLength: WISHES_MAX_LENGTH,
    description:
      'The wishes («Пожелания к образу»), trimmed; blank is none. A different text is a different try-on.',
  })
  @Transform(trimText)
  @IsOptional()
  @IsFreeText(WISHES_MAX_LENGTH)
  promptText?: string;
}
