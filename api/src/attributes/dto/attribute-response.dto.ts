import { ApiProperty } from '@nestjs/swagger';

// An attribute's own columns; its values come from /attributes/:id/values (spec 0004 E42).
export class AttributeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Цвет' })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
