import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// FittingSessionResponseDto.
export const fittingSessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  title: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /fitting-sessions.
export const fittingSessionListSchema = paginatedSchema(fittingSessionSchema);

export type FittingSession = z.infer<typeof fittingSessionSchema>;
export type FittingSessionList = z.infer<typeof fittingSessionListSchema>;
