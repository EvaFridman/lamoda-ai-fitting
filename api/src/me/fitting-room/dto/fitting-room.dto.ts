import { ApiProperty } from '@nestjs/swagger';

import { OutfitSlot } from '../../../generated/prisma/enums.js';
import { ProductListItemDto } from '../../../products/dto/product-response.dto.js';

// One item of the fitting room: the product as the catalog lists it, with the colour chosen.
export class FittingRoomItemDto {
  @ApiProperty({ enum: OutfitSlot, enumName: 'OutfitSlot' })
  slot: OutfitSlot;

  @ApiProperty({ type: ProductListItemDto })
  product: ProductListItemDto;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  attributeValueId: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The colour's name." })
  colour: string | null;
}

// The signed-in user's fitting room (spec 0019 plan §5, A86): the items in the slots' order, and
// only those of active categories.
export class FittingRoomDto {
  @ApiProperty({ type: [FittingRoomItemDto] })
  items: FittingRoomItemDto[];

  @ApiProperty({ minimum: 0, maximum: 5, description: 'The number of items.' })
  count: number;

  @ApiProperty({ example: 8990, description: "The items' prices after the discount, added up." })
  sum: number;
}

// The answer of PUT: the room after it, and the item it replaced for «Вернуть» (A62).
export class FittingRoomChangeDto {
  @ApiProperty({ type: FittingRoomDto })
  room: FittingRoomDto;

  @ApiProperty({
    type: FittingRoomItemDto,
    nullable: true,
    description: 'The item that was in the slot; null when it was empty.',
  })
  replaced: FittingRoomItemDto | null;
}
