// The coarse categories of a safety refusal (spec 0023 Y2, plan §3.5): web shows one text per
// category, never naming who refused. The same words as the database's enum `safety_category`.
export const SAFETY_CATEGORIES = [
  'sexual',
  'minors',
  'violence',
  'self_harm',
  'hate',
  'illicit',
  'unknown',
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

// Where the image model refused (`moderation_details.moderation_stage`): its inputs or its picture.
// OpenAI's `unknown`, or no stage, reads as `input` (plan §3.5).
export const MODERATION_STAGES = ['input', 'output'] as const;
export type ModerationStage = (typeof MODERATION_STAGES)[number];

// A refusal's stage and category, as a failed generation keeps them.
export interface SafetyRefusal {
  stage: ModerationStage;
  category: SafetyCategory;
}

// The first category found wins, in this order: a list naming minors and sexual content is about
// minors.
const PRIORITY: readonly Exclude<SafetyCategory, 'unknown'>[] = [
  'minors',
  'sexual',
  'violence',
  'self_harm',
  'hate',
  'illicit',
];

// OpenAI's names, by their first segment (`violence/graphic` is `violence`), with `-` read as `_`:
// the moderation endpoint's and the image model's coarse labels, which use the same words.
const BY_SEGMENT: ReadonlyMap<string, Exclude<SafetyCategory, 'unknown'>> = new Map([
  ['minors', 'minors'],
  ['sexual', 'sexual'],
  ['violence', 'violence'],
  ['self_harm', 'self_harm'],
  ['hate', 'hate'],
  ['harassment', 'hate'],
  ['illicit', 'illicit'],
]);

// The coarse category of OpenAI's flagged names; an empty list or names it does not know are
// `unknown`.
export function safetyCategory(names: readonly string[]): SafetyCategory {
  const found = new Set<SafetyCategory>();
  for (const name of names) {
    const normalized = name.trim().toLowerCase().replaceAll('-', '_');
    if (normalized === 'sexual/minors') {
      found.add('minors');
      continue;
    }
    const category = BY_SEGMENT.get(normalized.split('/')[0] ?? '');
    if (category !== undefined) found.add(category);
  }
  return PRIORITY.find((category) => found.has(category)) ?? 'unknown';
}

// The stage of `moderation_details`: `output` only when OpenAI says so.
export function moderationStage(stage: string | null | undefined): ModerationStage {
  return stage?.trim().toLowerCase() === 'output' ? 'output' : 'input';
}

// A check's refusal by the moderation endpoint, as the photo's and the text's details name it
// (`photo was refused: moderation:sexual`, plan §3.5).
export type ModerationRefusalReason = `moderation:${SafetyCategory}`;

export function moderationRefusal(names: readonly string[]): ModerationRefusalReason {
  return `moderation:${safetyCategory(names)}`;
}
