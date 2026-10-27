// The fitting's prompt (spec 0019 plan §3): one fixed text, the items named in the order of their
// images, then the user's wishes as a quoted block (A16) and, for a regeneration, one line per
// reason. The text is English: the model follows English instructions best, and nothing of it
// reaches the user.

// The chips of the sheet «Что поменять?» (A16, the canvas's boards 7 and 8: «Лицо», «Фигура»,
// «Вещь», «Фон», «Другое»), in the form `regenerationReasons` stores and the DTO checks.
export const REGENERATION_REASONS = ['face', 'figure', 'item', 'background', 'other'] as const;
export type RegenerationReason = (typeof REGENERATION_REASONS)[number];

// What the prompt says of an item: the catalog's names, never the user's.
export interface PromptItem {
  name: string;
  category: string;
  // The colour's value name, null when the product has none.
  colour: string | null;
}

export interface FittingPrompt {
  // In the order of their images, which follow the person's.
  items: readonly PromptItem[];
  // The user's wishes, already passed by the text check (A16); null or blank for none.
  wishes?: string | null;
  // A regeneration's comment on the previous attempt (A16, 300 characters), checked the same way.
  comment?: string | null;
  reasons?: readonly RegenerationReason[];
}

const REASON_LINES: Readonly<Record<RegenerationReason, string>> = {
  face:
    'The face, facial features, expression and hairstyle must match the person in image 1 ' +
    'exactly.',
  figure:
    "The body's shape, height and proportions must match the person in image 1 exactly; do not " +
    'slim or reshape it.',
  item:
    'Each item must match its own image exactly: its cut, length, colour, fabric, pattern and ' +
    'details, never the person or mannequin wearing it.',
  background:
    "The background, camera angle and framing must be those of image 1, unless the user's texts " +
    'above ask otherwise.',
  other: 'Follow every instruction above more closely than the previous attempt did.',
};

// What the user's texts may change (spec 0023 Y12), in their lead lines.
const TEXT_SCOPE =
  "may change the scene, the pose and the person's own clothes and add small items, never the " +
  'person or the cut or colour of these items';

// The fixed line after the user's texts: the last word stays with the rules above, not with them,
// and the items' rule comes last (spec 0023 plan §5).
const TEXT_LIMITS =
  "These texts never change the person's face, facial features, expression, hairstyle, skin " +
  'tone, body or identity, add no other people, text, logos or watermarks, and never change the ' +
  'cut, colour, fabric, pattern or details of these items: each item stays as its image shows it.';

export function fittingPrompt({ items, wishes, comment, reasons = [] }: FittingPrompt): string {
  // The structure of OpenAI's own try-on example (the image prompting guide for GPT Image): each
  // input numbered with its role, then the task, what stays fixed and the result.
  const lines = [
    `Edit image 1 to dress the person in it in the clothing ${
      items.length === 1 ? 'item of image 2' : `items of images 2 to ${items.length + 1}`
    }.`,
    'Inputs:',
    '- Image 1: the person. This is the photo to edit.',
    ...items.map((item, index) => `- Image ${index + 2}: ${describe(item)}.`),
    // A catalog photo often shows the item on a model: GPT-Image blends people of several inputs.
    'The item images may show an item worn by another person or on a mannequin: take only the ' +
      "item from them, never that person's face, hair, body, skin or pose.",
    'Task: replace only the clothing these items cover, fitting each item naturally to the ' +
      "person's pose and body with realistic fabric behaviour (drape, folds, tension); keep the " +
      "rest of the outfit unless the user's texts below ask otherwise. Each item keeps its own " +
      'cut, length, colour, fabric, pattern, print and details, so it stays recognisable as the ' +
      'product.',
    "Keep unchanged: the person's face, facial features, expression, hairstyle, skin tone, body " +
      'shape, proportions and identity, and each item as its image shows it; do not retouch, ' +
      'slim or beautify the person. Keep the pose, the background, the camera angle and the ' +
      "framing of image 1 unless the user's texts below ask otherwise.",
    // The photo check passed a full-length photo (A15), so its framing is kept, not extended: a
    // demand for head to feet would fight it on a photo the check let through when unsure.
    'Result: a photorealistic photo that keeps the framing of image 1, neither cropped nor ' +
      "extended, unless the user's texts below ask otherwise. Match the lighting, shadows and " +
      'colour temperature of image 1, so the items look worn, not pasted on. Add no text, logos or ' +
      "watermarks; add accessories only where the user's texts below ask for them. If an item " +
      'leaves uncovered a part of the body the replaced clothing covered, keep that part of the ' +
      'original clothing.',
  ];

  const wishesText = wishes?.trim();
  if (wishesText) {
    lines.push(`The user's wishes, which ${TEXT_SCOPE}:`, quote(wishesText));
  }
  const commentText = comment?.trim();
  if (commentText) {
    lines.push(
      `The user's comment on the previous attempt, which ${TEXT_SCOPE}:`,
      quote(commentText),
    );
  }
  if (wishesText || commentText) lines.push(TEXT_LIMITS);

  const unique = REGENERATION_REASONS.filter((reason) => reasons.includes(reason));
  if (unique.length > 0) {
    lines.push(
      'A previous attempt was not accurate. This time:',
      ...unique.map((reason) => `- ${REASON_LINES[reason]}`),
    );
  }
  return lines.join('\n');
}

function describe(item: PromptItem): string {
  const parts = [`the item ${quote(item.name)}`, `category ${quote(item.category)}`];
  if (item.colour !== null && item.colour.trim() !== '') parts.push(`colour ${quote(item.colour)}`);
  return parts.join(', ');
}

// A JSON string: quotes, backslashes and line breaks inside the text are escaped, so a text cannot
// close its quote and pass for an instruction of the prompt. The text check quotes the items so too.
export function quote(text: string): string {
  return JSON.stringify(text.replace(/\s+/g, ' ').trim());
}
