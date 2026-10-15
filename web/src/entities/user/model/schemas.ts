import { z } from 'zod';

import { paginatedSchema } from '@/shared/api';

// Gender.
export const genderSchema = z.enum(['male', 'female']);

// UserResponseDto.
export const userSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  patronymic: z.string().nullable(),
  dateOfBirth: z.iso.date().nullable(),
  gender: genderSchema.nullable(),
  fittingProfileImageKey: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// GET /users.
export const userListSchema = paginatedSchema(userSchema);

export type Gender = z.infer<typeof genderSchema>;
export type User = z.infer<typeof userSchema>;
export type UserList = z.infer<typeof userListSchema>;
