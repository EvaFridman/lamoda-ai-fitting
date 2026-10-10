import { ApiProperty } from '@nestjs/swagger';

import { Gender } from '../../generated/prisma/enums.js';

// A user's own columns, no session ids (spec 0004 E47). The profile photo has no url: personal
// photos are not public catalog media.
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+79991234567' })
  phone: string;

  @ApiProperty({ example: 'anna@mail.ru' })
  email: string;

  @ApiProperty({ example: 'Анна' })
  firstName: string;

  @ApiProperty({ type: String, nullable: true, example: 'Иванова' })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Сергеевна' })
  patronymic: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2000-01-31' })
  dateOfBirth: string | null;

  @ApiProperty({ enum: Gender, enumName: 'Gender', nullable: true })
  gender: Gender | null;

  @ApiProperty({ type: String, nullable: true, example: 'users/profile.jpg' })
  fittingProfileImageKey: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
