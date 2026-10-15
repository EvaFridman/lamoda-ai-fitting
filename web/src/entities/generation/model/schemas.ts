import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// GenerationStatus. A value web does not know fails the schema (H13).
export const generationStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

// AiGenerationResponseDto.
export const generationSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  productIds: z.array(z.uuid()),
  userImageKey: z.string(),
  resultImageKey: z.string().nullable(),
  status: generationStatusSchema,
  aiProvider: z.string(),
  aiModel: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /ai-generations.
export const generationListSchema = paginatedSchema(generationSchema);

export type GenerationStatus = z.infer<typeof generationStatusSchema>;
export type Generation = z.infer<typeof generationSchema>;
export type GenerationList = z.infer<typeof generationListSchema>;
