import { z } from 'zod';

import {
  type AiLogger,
  answerState,
  type CallOptions,
  type OpenAiClient,
  outputText,
} from '../openai-client.js';
import { type PromptItem, quote } from '../prompts.js';
import type { ModerationChecker } from './moderation-checker.js';

// Why a wish or a regeneration comment is refused (A16): the classification's reasons, and
// `moderation` for a text the moderation endpoint flagged. Internal: the api answers one code,
// `PROMPT_REFUSED`, whatever the reason.
export const PROMPT_CLASSIFICATION_REASONS = [
  'other_people',
  'nudity',
  'minors',
  'violence',
  'politics',
  'unrelated',
] as const;
export type PromptClassificationReason = (typeof PROMPT_CLASSIFICATION_REASONS)[number];
export type PromptRefusalReason = PromptClassificationReason | 'moderation';

export type PromptCheck = { allowed: true } | { allowed: false; reason: PromptRefusalReason };

const verdict = z.object({
  allowed: z.boolean(),
  reason: z.enum([...PROMPT_CLASSIFICATION_REASONS, 'none']),
});

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    reason: { type: 'string', enum: [...PROMPT_CLASSIFICATION_REASONS, 'none'] },
  },
  required: ['allowed', 'reason'],
  additionalProperties: false,
} as const;

// The chosen items as the text check names them (spec 0023 Y16): the catalog's names, never the
// user's.
export type PromptCheckItem = Pick<PromptItem, 'name' | 'category'>;

// Spec 0023 Y12 (replacing spec 0019 A16's limits): allowed besides the fit and the styling of the
// chosen items are the scene, the pose, the person's own clothes and small additions; refused are
// other people, nudity, minors, violence, politics, and changing the person, adding text or
// changing the chosen items, whose colour is the colour choice.
export const PROMPT_INSTRUCTIONS =
  'You classify a short wish a user typed for a virtual clothes try-on, where a photo of the user ' +
  'is edited so that the user wears the chosen items of clothing, listed below. Answer only with ' +
  'JSON. Allowed, with reason none: wishes about the fit and the styling of the chosen items (how ' +
  'they sit, their length on the body, tucked in or loose, sleeves rolled up, buttoned or open, ' +
  'the mood of the look), the background or the scene, the pose, the colour and style of the ' +
  "person's own clothes that are not one of the chosen items, and small additions to the look (a " +
  'scarf, a belt, a bag in hand). Refused, with the matching reason: other_people (another ' +
  'person, or changing who is in the photo), nudity (nudity or sexual content), minors ' +
  '(children), violence (violence or harm), politics (politics, religion or ideology), unrelated ' +
  '(changing the face, the body or the identity, adding text or logos, changing the cut or the ' +
  'colour of a chosen item, or anything that is not about the look of the photo).';

// The instructions with the chosen items, each quoted as a JSON string as the prompt quotes them.
export function promptInstructions(items: readonly PromptCheckItem[]): string {
  const list = items.map((item) => `- ${quote(item.name)}, category ${quote(item.category)}`);
  return [PROMPT_INSTRUCTIONS, 'The chosen items:', ...list].join('\n');
}

// The text check (spec 0019 A16, A45): the moderation endpoint (any flagged category refuses) and
// the small model's classification, in parallel under the caller's one deadline. A malformed
// answer of the model counts as allowed with a warning, as the photo check's does: the safety
// line is the moderation of the text and of the result, the classification keeps the prompt on
// topic.
export class PromptChecker {
  constructor(
    private readonly client: OpenAiClient,
    private readonly moderation: ModerationChecker,
    private readonly visionModel: string,
    private readonly logger: AiLogger,
  ) {}

  async check(
    text: string,
    items: readonly PromptCheckItem[],
    options: CallOptions,
  ): Promise<PromptCheck> {
    const [classification, moderation] = await Promise.all([
      this.classify(text, items, options),
      this.moderation.checkText(text, options),
    ]);
    if (moderation.flagged) return { allowed: false, reason: 'moderation' };
    return classification;
  }

  private async classify(
    text: string,
    items: readonly PromptCheckItem[],
    options: CallOptions,
  ): Promise<PromptCheck> {
    const answer = await this.client.respond(
      {
        model: this.visionModel,
        instructions: promptInstructions(items),
        input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
        text: {
          format: {
            type: 'json_schema',
            name: 'prompt_check',
            strict: true,
            schema: VERDICT_SCHEMA,
          },
        },
        // Room for a reasoning model's hidden tokens (see PhotoChecker).
        max_output_tokens: 200,
        store: false,
      },
      options,
    );
    const parsed = parseVerdict(outputText(answer));
    if (parsed === null) {
      this.logger.warn(
        `OpenAI text check: the model answered no readable verdict (${answerState(answer)}); counted as allowed`,
      );
      return { allowed: true };
    }
    if (parsed.allowed || parsed.reason === 'none') return { allowed: true };
    return { allowed: false, reason: parsed.reason };
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
