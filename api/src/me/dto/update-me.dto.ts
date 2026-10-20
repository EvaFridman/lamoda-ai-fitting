import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, ValidateIf } from 'class-validator';

import { Gender } from '../../generated/prisma/enums.js';
import {
  IsDateOfBirth,
  IsPersonName,
  MIN_AGE,
  PERSON_NAME_MAX_LENGTH,
  PERSON_NAME_MIN_LENGTH,
} from '../../common/validation/rules.js';

const NAME = { minLength: PERSON_NAME_MIN_LENGTH, maxLength: PERSON_NAME_MAX_LENGTH };

// The fields a user edits themselves (spec 0017 U2); any other field is refused by the whitelist
// (AC11). `null` clears a name or the date, `firstName` too (0013 N5); the gender, once chosen,
// is changed but never cleared (U9), so `null` fails `IsEnum`.
export class UpdateMeDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Иванова', ...NAME })
  @IsOptional()
  @IsPersonName()
  lastName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Анна', ...NAME })
  @IsOptional()
  @IsPersonName()
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Сергеевна', ...NAME })
  @IsOptional()
  @IsPersonName()
  patronymic?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2000-01-31',
    description: `From 1900-01-01; at least ${MIN_AGE} years before today (UTC).`,
  })
  @IsOptional()
  @IsDateOfBirth()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', description: 'Cannot be cleared.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(Gender)
  gender?: Gender;
}
