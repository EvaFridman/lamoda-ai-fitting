import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// BrandResponseDto.
export const brandSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /brands.
export const brandListSchema = paginatedSchema(brandSchema);

export type Brand = z.infer<typeof brandSchema>;
export type BrandList = z.infer<typeof brandListSchema>;
