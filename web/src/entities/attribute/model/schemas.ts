import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// AttributeResponseDto: no `values[]`, they come paged from GET /attributes/:id/values.
export const attributeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// AttributeValueResponseDto.
export const attributeValueSchema = z.object({
  id: z.uuid(),
  attributeId: z.uuid(),
  value: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /attributes.
export const attributeListSchema = paginatedSchema(attributeSchema);
// GET /attributes/:id/values.
export const attributeValueListSchema = paginatedSchema(attributeValueSchema);

export type Attribute = z.infer<typeof attributeSchema>;
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export type AttributeList = z.infer<typeof attributeListSchema>;
export type AttributeValueList = z.infer<typeof attributeValueListSchema>;
