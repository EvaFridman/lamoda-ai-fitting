import { ApiProperty } from '@nestjs/swagger';

// A session's own columns, no generation ids (spec 0004 E7, E48).
export class FittingSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ type: String, nullable: true, example: 'Вечернее платье' })
  title: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
