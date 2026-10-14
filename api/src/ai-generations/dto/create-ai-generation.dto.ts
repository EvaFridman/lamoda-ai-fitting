import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { GenerationStatus } from '../../generated/prisma/enums.js';
import {
  AI_NAME_MAX_LENGTH,
  ERROR_MESSAGE_MAX_LENGTH,
  IMAGE_KEY_MAX_LENGTH,
  IsImageKey,
  IsTrimmedText,
} from '../../common/validation/rules.js';

// Products of one generation (spec 0004 E53).
export const MAX_GENERATION_PRODUCTS = 20;

// Ids come in any letter case; lower-cased once here, so the duplicate check and the database see
// the same value. Anything but an array of strings stays as sent and fails the rules below.
function lowerCaseIds({ value }: { value: unknown }): unknown {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.map((item: string) => item.toLowerCase())
    : value;
}

// Fields of spec 0004 E52–E54. No initializers: PartialType would copy them into the update DTO.
// The triple of `status`, `resultImageKey` and `errorMessage` is checked by the service
// (generation-triple.ts), on the merged row for an update.
export class CreateAiGenerationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_GENERATION_PRODUCTS,
    uniqueItems: true,
    description:
      'The products tried on. In an update, sent replaces the links, left out keeps them.',
  })
  @Transform(lowerCaseIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GENERATION_PRODUCTS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  productIds: string[];

  @ApiProperty({ example: 'users/photo.jpg', maxLength: IMAGE_KEY_MAX_LENGTH })
  @IsImageKey()
  userImageKey: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'generations/result.jpg',
    maxLength: IMAGE_KEY_MAX_LENGTH,
    description: 'Required when status is completed; null when pending or processing.',
  })
  @IsOptional()
  @IsImageKey()
  resultImageKey?: string | null;

  @ApiProperty({ enum: GenerationStatus, enumName: 'GenerationStatus' })
  @IsEnum(GenerationStatus)
  status: GenerationStatus;

  @ApiProperty({ maxLength: AI_NAME_MAX_LENGTH, example: 'openai' })
  @IsTrimmedText(AI_NAME_MAX_LENGTH)
  aiProvider: string;

  @ApiProperty({ maxLength: AI_NAME_MAX_LENGTH, example: 'gpt-image-1' })
  @IsTrimmedText(AI_NAME_MAX_LENGTH)
  aiModel: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ERROR_MESSAGE_MAX_LENGTH,
    example: 'PROVIDER_TIMEOUT',
    description: 'Required when status is failed, null otherwise.',
  })
  @IsOptional()
  @IsTrimmedText(ERROR_MESSAGE_MAX_LENGTH)
  errorMessage?: string | null;
}
