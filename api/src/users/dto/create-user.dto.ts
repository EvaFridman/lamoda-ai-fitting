import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { Gender } from '../../generated/prisma/enums.js';
import {
  EMAIL_MAX_LENGTH,
  IMAGE_KEY_MAX_LENGTH,
  IsDateOfBirth,
  IsImageKey,
  IsPersonName,
  IsPhone,
  IsUserEmail,
  MIN_AGE,
  PERSON_NAME_MAX_LENGTH,
  PERSON_NAME_MIN_LENGTH,
} from '../../common/validation/rules.js';

const NAME = { minLength: PERSON_NAME_MIN_LENGTH, maxLength: PERSON_NAME_MAX_LENGTH };

// `phone`, `email` and `firstName` are required; the other fields may be left out or `null`, and
// `null` in an update clears them (spec 0004 E47).
export class CreateUserDto {
  @ApiProperty({
    example: '+79991234567',
    description: 'Also takes `8 (999) 123-45-67`, `+7 999 123 45 67` or `999 123-45-67`.',
  })
  @IsPhone()
  phone: string;

  @ApiProperty({
    example: 'anna@mail.ru',
    maxLength: EMAIL_MAX_LENGTH,
    description: 'Trimmed and lower-cased.',
  })
  @IsUserEmail()
  email: string;

  @ApiProperty({ example: 'Анна', ...NAME })
  @IsPersonName()
  firstName: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Иванова', ...NAME })
  @IsOptional()
  @IsPersonName()
  lastName?: string | null;

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

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'users/profile.jpg',
    maxLength: IMAGE_KEY_MAX_LENGTH,
  })
  @IsOptional()
  @IsImageKey()
  fittingProfileImageKey?: string | null;
}
