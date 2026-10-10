import { ApiProperty } from '@nestjs/swagger';

// A value's own columns (spec 0004 E42).
export class AttributeValueResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  attributeId: string;

  @ApiProperty({ example: 'чёрный' })
  value: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
