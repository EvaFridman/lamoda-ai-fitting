import { z } from 'zod';

// Lamoda Sport's three kinds of store (spec 0022 X9); the api's enum StoreType. The name says which,
// so the card shows no type of its own.
export const storeTypeSchema = z.enum(['sport', 'urban', 'outlet']);

// StoreResponseDto.
export const storeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: storeTypeSchema,
  city: z.string(),
  street: z.string(),
  house: z.string(),
  mall: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  // Empty: no station near, no metro line on the card (X20).
  metroStations: z.array(z.string()),
  workTime: z.string(),
  description: z.string(),
  // Lamoda's text of each phone; empty: no phone line in the details (X20).
  phones: z.array(z.string()),
});

// GET /stores: every store, in Lamoda's order (Moscow first), a plain array.
export const storeListSchema = z.array(storeSchema);

export type StoreType = z.infer<typeof storeTypeSchema>;
export type Store = z.infer<typeof storeSchema>;
export type StoreList = z.infer<typeof storeListSchema>;
