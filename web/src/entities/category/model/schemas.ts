import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// The place of a category's products in a look (spec 0019 A18); the api's enum OutfitSlot.
export const outfitSlotSchema = z.enum(['top', 'bottom', 'outerwear', 'shoes', 'accessory']);

// CategoryResponseDto.
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  // `null`: a category outside the fitting room.
  slot: outfitSlotSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /categories.
export const categoryListSchema = paginatedSchema(categorySchema);

export type OutfitSlot = z.infer<typeof outfitSlotSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryList = z.infer<typeof categoryListSchema>;
