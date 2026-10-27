import { z } from 'zod';

import { type ImageInput, toDataUrl } from '../image-input.js';
import {
  type AiLogger,
  answerState,
  type CallOptions,
  type OpenAiClient,
  outputText,
} from '../openai-client.js';
import { type ModerationRefusalReason, moderationRefusal } from '../safety-category.js';
import type { ModerationChecker } from './moderation-checker.js';

// The five reasons of the canvas (A15), in the code form the api answers (plan §5: the detail
// `PHOTO_REFUSED` carries the reason in its message), and `moderation:<category>` for a flagged
// photo (spec 0023 plan §3.5).
export const PHOTO_VISION_REASONS = [
  'dark',
  'not_full',
  'many_people',
  'child',
  'no_person',
] as const;
export type PhotoVisionReason = (typeof PHOTO_VISION_REASONS)[number];
export type PhotoRefusalReason = PhotoVisionReason | ModerationRefusalReason;

export type PhotoCheck = { ok: true } | { ok: false; reason: PhotoRefusalReason };

// What the vision model answers; `none` is the reason of an accepted photo (a strict JSON schema
// has no optional fields).
const verdict = z.object({
  ok: z.boolean(),
  reason: z.enum([...PHOTO_VISION_REASONS, 'none']),
});

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string', enum: [...PHOTO_VISION_REASONS, 'none'] },
  },
  required: ['ok', 'reason'],
  additionalProperties: false,
} as const;

// «Refuse only when sure» (plan §3): the check is a quality filter, a wrong refusal costs the user
// nothing but a retry, a wrong acceptance a wasted try-on; the safety line is the moderation.
export const PHOTO_INSTRUCTIONS =
  'You check a photo a user uploaded for a virtual clothes try-on, where the person in the photo ' +
  'will be shown wearing other clothes. Answer only with JSON. Set ok to false only when you are ' +
  'sure of one of these reasons: dark (the photo is too dark to see the person and the clothes), ' +
  'not_full (the person is not shown full length, from the head to the feet), many_people (more ' +
  'than one person is in the photo), child (the person is a child), no_person (there is no person ' +
  'in the photo). Otherwise set ok to true and reason to none. When in doubt, answer ok.';

// The photo check (spec 0019 A15, A45): the vision model's verdict and the moderation endpoint, in
// parallel under the caller's one deadline. A flagged photo answers `moderation:<category>` whatever the
// model said; a malformed answer of the model counts as ok with a warning, since a check must
// never block an honest photo.
export class PhotoChecker {
  constructor(
    private readonly client: OpenAiClient,
    private readonly moderation: ModerationChecker,
    private readonly visionModel: string,
    private readonly logger: AiLogger,
  ) {}

  async check(image: ImageInput, options: CallOptions): Promise<PhotoCheck> {
    const [vision, moderation] = await Promise.all([
      this.classify(image, options),
      this.moderation.checkImage(image, options),
    ]);
    if (moderation.flagged) return { ok: false, reason: moderationRefusal(moderation.categories) };
    return vision;
  }

  private async classify(image: ImageInput, options: CallOptions): Promise<PhotoCheck> {
    const answer = await this.client.respond(
      {
        model: this.visionModel,
        instructions: PHOTO_INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_image', image_url: toDataUrl(image), detail: 'low' }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'photo_check',
            strict: true,
            schema: VERDICT_SCHEMA,
          },
        },
        // Room for a reasoning model's hidden tokens, which count against it: a cap too low ends
        // the answer `incomplete` with no verdict.
        max_output_tokens: 200,
        // The user's photo is not kept at OpenAI (A46: for the check and the generation only).
        store: false,
      },
      options,
    );
    const parsed = parseVerdict(outputText(answer));
    if (parsed === null) {
      this.logger.warn(
        `OpenAI photo check: the model answered no readable verdict (${answerState(answer)}); counted as ok`,
      );
      return { ok: true };
    }
    if (parsed.ok || parsed.reason === 'none') return { ok: true };
    return { ok: false, reason: parsed.reason };
  }
}

function parseVerdict(text: string | null): z.infer<typeof verdict> | null {
  if (text === null) return null;
  try {
    const parsed = verdict.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
