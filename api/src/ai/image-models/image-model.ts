import type { AiProviderError } from '../ai-provider.error.js';
import type { ImageInput } from '../image-input.js';
import type { ImagesAnswer } from '../openai-client.js';
import type { PromptItem, RegenerationReason } from '../prompts.js';
import type { SafetyRefusal } from '../safety-category.js';

// An item of a fitting: what the prompt names and its first image.
export interface FittingItem extends PromptItem {
  image: ImageInput;
}

// The items one edits request carries besides the person (A29: up to five product photos).
export const MAX_FITTING_ITEMS = 5;

// A job past the item count is a bug of its caller (the routes refuse more, T12): both providers
// throw a plain Error before anything is paid, which the activity does not retry.
export function assertFittingItems(job: Pick<FittingJob, 'items'>): void {
  if (job.items.length < 1 || job.items.length > MAX_FITTING_ITEMS) {
    throw new Error(`A fitting takes 1 to ${MAX_FITTING_ITEMS} items, got ${job.items.length}`);
  }
}

// One generation (plan §4's `generate`): the person's photo and the items, already read from the
// bucket and re-encoded by `loadInputs` (A29), the texts the check passed and the regeneration's
// reasons.
export interface FittingJob {
  person: ImageInput;
  items: readonly FittingItem[];
  wishes?: string | null;
  comment?: string | null;
  reasons?: readonly RegenerationReason[];
}

// What a generation gives: the picture (WebP, which `storeResult` re-encodes), or the model's own
// refusal, which counts as moderation (A15) with its stage and coarse category (spec 0023 plan
// §3.5). OpenAI's request id goes into `providerRequestId`.
export type GenerationResult =
  | { ok: true; image: Uint8Array; requestId: string | null }
  | ({ ok: false; reason: 'moderation'; requestId: string | null } & SafetyRefusal);

// An image model of the edits endpoint (plan §3): its request and how its answer reads. Another
// model, or another provider's (backlog «The other models of 0016 S7»), is another implementation.
export interface ImageModel {
  // The short name `aiModel` stores and the fitting answers (A43).
  readonly name: string;
  buildRequest(job: FittingJob): FormData;
  // The picture of an answer, or null when it holds none (a refusal).
  parseAnswer(answer: ImagesAnswer): Uint8Array | null;
  // Whether a failed request is the model refusing the content, not a technical failure.
  isRefusal(error: AiProviderError): boolean;
}
