import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// Gender.
export const genderSchema = z.enum(['male', 'female']);

// UserResponseDto.
export const userSchema = z.object({
  id: z.uuid(),
  phone: z.string().nullable(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  patronymic: z.string().nullable(),
  dateOfBirth: z.iso.date().nullable(),
  gender: genderSchema.nullable(),
  fittingProfileImageKey: z.string().nullable(),
  // A signed link that works for 15 minutes (spec 0011 M9); null for a key outside the owner's
  // folder (M25).
  fittingProfileImageUrl: z.url().nullable(),
  // The photo consents' version the user gave, null with none (spec 0023 Y1).
  photoConsentVersion: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /users.
export const userListSchema = paginatedSchema(userSchema);

export type Gender = z.infer<typeof genderSchema>;
export type User = z.infer<typeof userSchema>;
export type UserList = z.infer<typeof userListSchema>;
