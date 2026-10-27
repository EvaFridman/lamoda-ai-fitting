import { ApiError, errorText } from '@/shared/api';

// The reasons the api names in the detail `PROMPT_REFUSED`'s message (spec 0023 plan §3.5,
// `promptText was refused: other_people`): the classification's, or `moderation:<category>` of a
// text the moderation endpoint flagged. Anything else is `unknown`.
export const PROMPT_REFUSAL_REASONS = [
  'other_people',
  'nudity',
  'minors',
  'violence',
  'politics',
  'unrelated',
  'sexual',
  'self_harm',
  'hate',
  'illicit',
  'unknown',
] as const;
export type PromptRefusalReason = (typeof PROMPT_REFUSAL_REASONS)[number];

const MESSAGE = /was refused: (?:moderation:)?([a-z_]+)$/;

/** The reason of a refused text (the wishes or the comment), or `null` for any other failure. */
export function promptRefusalReason(error: unknown): PromptRefusalReason | null {
  if (!(error instanceof ApiError) || error.kind !== 'http' || error.code !== 'PROMPT_REFUSED') {
    return null;
  }
  const detail = error.details.find((candidate) => candidate.code === 'PROMPT_REFUSED');
  const reason = detail ? MESSAGE.exec(detail.message)?.[1] : undefined;
  return PROMPT_REFUSAL_REASONS.find((known) => known === reason) ?? 'unknown';
}

const GENERAL_TEXT = 'Текст не подходит для примерки: опишите посадку, стиль, фон или позу';

// Plan §4.5's table: what the text may not be about, never who refused it.
export const PROMPT_REFUSAL_TEXTS: Readonly<Record<PromptRefusalReason, string>> = {
  other_people: 'Пожелание не может касаться других людей на фото',
  nudity: 'Пожелание не может касаться обнажённого тела',
  sexual: 'Пожелание не может касаться обнажённого тела',
  minors: 'Пожелание не может касаться детей',
  violence: 'Пожелание не может касаться насилия',
  self_harm: 'Пожелание не может касаться насилия',
  politics: 'Пожелание не может касаться политики, религии и оскорблений',
  hate: 'Пожелание не может касаться политики, религии и оскорблений',
  illicit: 'Пожелание не может касаться запрещённых вещей',
  unrelated:
    'Опишите образ: посадку, стиль, фон, позу или дополнения. Лицо, фигуру и сами вещи изменить нельзя',
  unknown: GENERAL_TEXT,
};

/** The text under the wishes or the comment for a refused text, or `null` for any other failure. */
export function promptRefusalText(error: unknown): string | null {
  const reason = promptRefusalReason(error);
  return reason ? PROMPT_REFUSAL_TEXTS[reason] : null;
}

/** The text of a failed start or regeneration: a refused text's own, else the api code's. */
export function fittingErrorText(error: unknown): string {
  return promptRefusalText(error) ?? errorText(error);
}
