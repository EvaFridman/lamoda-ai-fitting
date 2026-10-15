import { ApiProperty } from '@nestjs/swagger';

// A value's own columns (spec 0004 E42).
export class AttributeValueResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  attributeId: string;

  @ApiProperty({ example: 'чёрный' })
  value: string;

  @ApiProperty({ type: String, nullable: true, example: '#000000' })
  colorHex: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
