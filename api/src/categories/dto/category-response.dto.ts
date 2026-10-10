import { ApiProperty } from '@nestjs/swagger';

// A category's own columns, no products (spec 0004 E39).
export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Платья' })
  name: string;

  @ApiProperty({ example: 'dresses' })
  slug: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
