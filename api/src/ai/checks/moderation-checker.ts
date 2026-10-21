import { type ImageInput, toDataUrl } from '../image-input.js';
import type { CallOptions, ModerationAnswer, OpenAiClient } from '../openai-client.js';

// The verdict of the moderation endpoint: whether the input is refused, and the categories that
// refused it (their names only, for a log line; never the input).
export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

// The categories the endpoint computes for an image (A15: sexual, violence and self-harm, with
// their sub-categories).
const IMAGE_CATEGORY_PREFIXES = ['sexual', 'violence', 'self-harm'];

// The moderation endpoint (spec 0019 A15) for a photo, a text and the result. Free, so every image
// and every text goes through it.
export class ModerationChecker {
  constructor(private readonly client: OpenAiClient) {}

  // An image: refused when one of the image categories is flagged.
  async checkImage(image: ImageInput, options: CallOptions): Promise<ModerationResult> {
    const answer = await this.client.moderate({ imageUrl: toDataUrl(image) }, options);
    const categories = flaggedCategories(answer).filter((name) =>
      IMAGE_CATEGORY_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}/`)),
    );
    return { flagged: categories.length > 0, categories };
  }

  // A text: refused when any category is flagged (A16).
  async checkText(text: string, options: CallOptions): Promise<ModerationResult> {
    const answer = await this.client.moderate({ text }, options);
    const categories = flaggedCategories(answer);
    return { flagged: categories.length > 0 || firstResult(answer).flagged, categories };
  }
}

function firstResult(answer: ModerationAnswer): ModerationAnswer['results'][number] {
  // The schema requires at least one result.
  return answer.results[0] as ModerationAnswer['results'][number];
}

function flaggedCategories(answer: ModerationAnswer): string[] {
  return Object.entries(firstResult(answer).categories)
    .filter(([, flagged]) => flagged === true)
    .map(([name]) => name)
    .sort();
}
