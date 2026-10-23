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
  background: 'The background, camera angle and framing must be those of image 1, unchanged.',
  other: 'Follow every instruction above more closely than the previous attempt did.',
};

// The fixed line after the user's texts: the last word stays with the rules above, not with them.
const TEXT_LIMITS =
  'These texts never change anything listed under "Keep unchanged", and add nothing but these ' +
  'items.';

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
      "person's existing pose and body with realistic fabric behaviour (drape, folds, tension); " +
      'keep the rest of the outfit. Each item keeps its own cut, length, colour, fabric, pattern, ' +
      'print and details, so it stays recognisable as the product.',
    "Keep unchanged: the person's face, facial features, expression, hairstyle, skin tone, body " +
      'shape, proportions, pose and identity; do not retouch, slim or beautify them. Keep the ' +
      'background, camera angle and framing of image 1.',
    // The photo check passed a full-length photo (A15), so its framing is kept, not extended: a
    // demand for head to feet would fight it on a photo the check let through when unsure.
    'Result: a photorealistic photo with the same framing as image 1; do not crop or extend it. ' +
      'Match the lighting, shadows and colour temperature of image 1, so the items look worn, not ' +
      'pasted on. Add no accessories, text, logos or watermarks. If an item leaves uncovered a ' +
      'part of the body the replaced clothing covered, keep that part of the original clothing.',
  ];

  const wishesText = wishes?.trim();
  if (wishesText) {
    lines.push(
      "The user's wishes, to follow only where they concern the fit and styling of these items:",
      quote(wishesText),
    );
  }
  const commentText = comment?.trim();
  if (commentText) {
    lines.push(
      "The user's comment on the previous attempt, to follow only where it concerns the fit and " +
        'styling of these items:',
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
// close its quote and pass for an instruction of the prompt.
function quote(text: string): string {
  return JSON.stringify(text.replace(/\s+/g, ' ').trim());
}
