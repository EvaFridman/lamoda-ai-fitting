import { ApiProperty } from '@nestjs/swagger';

import { OutfitSlot } from '../../generated/prisma/enums.js';

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

  // The place of the category's products in a look, `null` for a category outside the fitting room
  // (spec 0019 A18).
  @ApiProperty({ enum: OutfitSlot, enumName: 'OutfitSlot', nullable: true })
  slot: OutfitSlot | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
