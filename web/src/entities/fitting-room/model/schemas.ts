import { z } from 'zod';

import { outfitSlotSchema, type OutfitSlot } from '@/entities/category/@x/fitting-room';
import { productListItemSchema } from '@/entities/product/@x/fitting-room';

// FittingRoomItemDto: a slot's product and its colour (spec 0019 A86).
export const fittingRoomItemSchema = z.object({
  slot: outfitSlotSchema,
  product: productListItemSchema,
  // The colour chosen, one of the product's attribute values; null: none.
  attributeValueId: z.uuid().nullable(),
  // The colour's name.
  colour: z.string().nullable(),
});

// FittingRoomDto: GET /me/fitting-room, the items in the slots' order.
export const fittingRoomSchema = z.object({
  items: z.array(fittingRoomItemSchema),
  count: z.number(),
  // The items' prices after the discount, added up.
  sum: z.number(),
});

// FittingRoomChangeDto: PUT /me/fitting-room/:slot. `replaced` is the slot's previous item, null
// when it was empty or held the same product in the same colour (A86).
export const fittingRoomChangeSchema = z.object({
  room: fittingRoomSchema,
  replaced: fittingRoomItemSchema.nullable(),
});

export type FittingRoomItem = z.infer<typeof fittingRoomItemSchema>;
export type FittingRoom = z.infer<typeof fittingRoomSchema>;
export type FittingRoomChange = z.infer<typeof fittingRoomChangeSchema>;
export type { OutfitSlot };

// PutFittingRoomItemDto.
export interface PutRoomItemBody {
  productId: string;
  // Left out: no colour.
  attributeValueId?: string;
}

// An empty room, as `GET` answers it for a user with none.
export const EMPTY_ROOM: FittingRoom = { items: [], count: 0, sum: 0 };

// The room without one slot's item, as the api will answer after `DELETE /:slot`.
export function withoutSlot(room: FittingRoom, slot: OutfitSlot): FittingRoom {
  const items = room.items.filter((item) => item.slot !== slot);
  return {
    items,
    count: items.length,
    sum: items.reduce((sum, item) => sum + item.product.finalPrice, 0),
  };
}
