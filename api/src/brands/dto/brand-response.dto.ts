import { ApiProperty } from '@nestjs/swagger';

// A brand's own columns, no products (spec 0004 E39).
export class BrandResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Lamoda' })
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
