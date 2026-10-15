import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// CategoryResponseDto.
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /categories.
export const categoryListSchema = paginatedSchema(categorySchema);

export type Category = z.infer<typeof categorySchema>;
export type CategoryList = z.infer<typeof categoryListSchema>;
