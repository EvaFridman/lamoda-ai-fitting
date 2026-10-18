import { ApiProperty } from '@nestjs/swagger';

import { Gender } from '../../generated/prisma/enums.js';

// A user's own columns, no session ids (spec 0004 E47), and a signed link to the fitting photo
// (spec 0011 M9).
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  // Null for a user who signed in with Google: it gives no phone, and a given name that fails the
  // name rule is not kept (spec 0013 N5).
  @ApiProperty({ type: String, nullable: true, example: '+79991234567' })
  phone: string | null;

  @ApiProperty({ example: 'anna@mail.ru' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: 'Анна' })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Иванова' })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Сергеевна' })
  patronymic: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2000-01-31' })
  dateOfBirth: string | null;

  @ApiProperty({ enum: Gender, enumName: 'Gender', nullable: true })
  gender: Gender | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'keep/users/0b6f2a52-6d1e-4f8a-9c3b-2e7d5a1c4f90/photos/5e3a7c1d-2b4f-4e6a-8d9c-1f0b3a5e7c2d.webp',
  })
  fittingProfileImageKey: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      "Reads the photo for S3_SIGNED_URL_TTL_SECONDS (15 minutes); null with no photo or when the key is outside the owner's folder.",
  })
  fittingProfileImageUrl: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
