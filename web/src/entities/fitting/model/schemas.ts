import { z } from 'zod';

import { outfitSlotSchema } from '@/entities/category/@x/fitting';
import { cursorPaginatedSchema } from '@/shared/api';

// A value web does not know fails the schema (H13): a newer api's status is an `ApiError` of kind
// `schema`, never shown as something else.

// FittingKind: one item, or a look of 2–5 items of distinct slots.
export const fittingKindSchema = z.enum(['single', 'look']);

// GenerationStatus. A fitting runs while `pending` or `processing`.
export const fittingStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

// `queued` while pending, `generating` while processing, `done` once it ended (spec 0019 A70).
export const fittingStageSchema = z.enum(['queued', 'generating', 'done']);

// FittingFailure: why a fitting failed; null while it runs and once completed.
export const fittingFailureSchema = z.enum([
  'photo_dark',
  'photo_not_full',
  'photo_many_people',
  'photo_child',
  'photo_no_person',
  'prompt_refused',
  'model_timeout',
  'moderation',
  'provider_error',
]);

// SafetyCategory: what a `moderation` failure was flagged for (spec 0023 Y2); `unknown` for a label
// the api does not map and for a row older than the category.
export const safetyCategorySchema = z.enum([
  'sexual',
  'minors',
  'violence',
  'self_harm',
  'hate',
  'illicit',
  'unknown',
]);

// ModerationStage: whether the person's photo and items (`input`) or the result (`output`) was
// refused.
export const moderationStageSchema = z.enum(['input', 'output']);

// An http(s) link only, so a broken answer never becomes a `javascript:` link.
const httpUrl = z.url({ protocol: /^https?$/ });

// FittingItemResponseDto: an item tried on, in the colour chosen.
export const fittingItemSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  brand: z.string(),
  imageUrl: httpUrl.nullable(),
  price: z.number(),
  finalPrice: z.number(),
  attributeValueId: z.uuid().nullable(),
  colour: z.string().nullable(),
  // The slot it was tried on in: a look's items show in the slots' order.
  slot: outfitSlotSchema.nullable(),
});

// FittingDto.
export const fittingSchema = z.object({
  id: z.uuid(),
  kind: fittingKindSchema,
  // The result this one regenerates; null for a try-on, or once that one is deleted.
  parentId: z.uuid().nullable(),
  status: fittingStatusSchema,
  stage: fittingStageSchema,
  failureCode: fittingFailureSchema.nullable(),
  // Both set only with `failureCode` `moderation`, else null.
  failureCategory: safetyCategorySchema.nullable(),
  failureStage: moderationStageSchema.nullable(),
  // Whether it spent a try-on of the month: false for a free regeneration and a failed one.
  countsAgainstLimit: z.boolean(),
  // Whether this result's next regeneration is free (A6, A70).
  regenerationFree: z.boolean(),
  model: z.string(),
  items: z.array(fittingItemSchema),
  // Null once the photo is deleted; the result stays.
  photoId: z.uuid().nullable(),
  // Whether that photo is a one-time one (true) or saved (false); null once it is gone (spec 0024
  // Z42): the result's save switch.
  photoTransient: z.boolean().nullable(),
  // The wishes it was tried on with, null when none: a colour change sends them again (A92.1).
  // Personal text: rendered nowhere.
  promptText: z.string().nullable(),
  // A signed link that works for 15 minutes (spec 0011 M9); null with no result or a key outside
  // the owner's folder (M25). Personal data: only ever an image's `src` (spec 0019 A37).
  resultUrl: httpUrl.nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  // The expected seconds from the start to the result (A27); null once it ended.
  estimatedSeconds: z.number().nullable(),
});

// StartedFittingDto: the answer of a start or a regeneration. `repeated` is an earlier completed
// result of the same photo, items and wishes, opened for free (A7).
export const startedFittingSchema = fittingSchema.extend({ repeated: z.boolean() });

// GET /fittings: newest first, paged by cursor.
export const fittingListSchema = cursorPaginatedSchema(fittingSchema);

// FittingQuotaDto: the try-ons of this month. The limit renews at `renewsAt` (A70: the 409
// `LIMIT_REACHED` names it only in its message).
export const fittingQuotaSchema = z.object({
  limit: z.number(),
  used: z.number(),
  left: z.number(),
  renewsAt: z.iso.datetime(),
  // Completed results not opened yet: the header's badge (spec 0024 Z18).
  unseen: z.number(),
});

export type FittingKind = z.infer<typeof fittingKindSchema>;
export type FittingStatus = z.infer<typeof fittingStatusSchema>;
export type FittingStage = z.infer<typeof fittingStageSchema>;
export type FittingFailure = z.infer<typeof fittingFailureSchema>;
export type SafetyCategory = z.infer<typeof safetyCategorySchema>;
export type ModerationStage = z.infer<typeof moderationStageSchema>;
export type FittingItem = z.infer<typeof fittingItemSchema>;
export type Fitting = z.infer<typeof fittingSchema>;
export type StartedFitting = z.infer<typeof startedFittingSchema>;
export type FittingList = z.infer<typeof fittingListSchema>;
export type FittingQuota = z.infer<typeof fittingQuotaSchema>;

// A fitting still running: its stage changes and its result is yet to come.
export function isFittingRunning(fitting: Pick<Fitting, 'status'>): boolean {
  return fitting.status === 'pending' || fitting.status === 'processing';
}

// StartFittingDto.
export interface StartFittingBody {
  // A photo of «Мои фото» or a one-time one (`save=false`).
  photoId: string;
  kind: FittingKind;
  // One item for `single`, 2 to 5 of distinct slots for `look`. `attributeValueId` left out is the
  // product's own colour.
  items: { productId: string; attributeValueId?: string }[];
  // The wishes («Пожелания к образу»), at most 200 characters; blank is none.
  promptText?: string;
}

// RegenerateFittingDto. web sends no `reasons` (spec 0023 Y9): an empty body is one more attempt.
export interface RegenerateFittingBody {
  // At most 300 characters; blank is none.
  comment?: string;
}
