import { z } from 'zod';

// UserPhotoDto.
export const userPhotoSchema = z.object({
  id: z.uuid(),
  // A signed link that works for 15 minutes (spec 0011 M9); null for a key outside the owner's
  // folder (M25). Personal data: only ever an image's `src` (spec 0019 A37). http(s) only, so a
  // broken answer never becomes a `javascript:` link.
  url: z.url({ protocol: /^https?$/ }).nullable(),
  isDefault: z.boolean(),
  // A one-time photo (uploaded with `save=false`, A24): never in the list of saved ones.
  transient: z.boolean(),
  width: z.number(),
  height: z.number(),
  createdAt: z.iso.datetime(),
});

// GET /me/photos: the saved photos, oldest first, at most five; a plain array (plan §5).
export const userPhotoListSchema = z.array(userPhotoSchema);

export type UserPhoto = z.infer<typeof userPhotoSchema>;
