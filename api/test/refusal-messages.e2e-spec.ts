import { describe, expect, it } from 'vitest';

import { PHOTO_VISION_REASONS } from '../src/ai/checks/photo-checker.js';
import { PROMPT_CLASSIFICATION_REASONS } from '../src/ai/checks/prompt-checker.js';
import { refusalMessage } from '../src/ai/refusal-message.js';
import { SAFETY_CATEGORIES } from '../src/ai/safety-category.js';
import { PHOTO_FIELD } from '../src/me/photos/photo-upload.js';

// Every message of a `PHOTO_REFUSED` and `PROMPT_REFUSED` detail the api can answer, as a committed
// snapshot: web's refusal contract tests read each one through the parsers that pick the texts. A
// new reason or field fails this test until `npm --prefix api test -- -u` rewrites
// api/refusal-messages.json, committed with the change.

const MODERATION_REASONS = SAFETY_CATEGORIES.map((category) => `moderation:${category}`);

function entries(fields: readonly string[], reasons: readonly string[]) {
  return fields.flatMap((field) =>
    reasons.map((reason) => ({ field, reason, message: refusalMessage(field, reason) })),
  );
}

describe('refusal messages', () => {
  const messages = {
    PHOTO_REFUSED: entries([PHOTO_FIELD], [...PHOTO_VISION_REASONS, ...MODERATION_REASONS]),
    PROMPT_REFUSED: entries(
      ['promptText', 'comment'],
      [...PROMPT_CLASSIFICATION_REASONS, ...MODERATION_REASONS],
    ),
  };

  it('name the field and the reason', () => {
    expect(refusalMessage('photo', 'child')).toBe('photo was refused: child');
    expect(messages.PHOTO_REFUSED).toContainEqual({
      field: 'photo',
      reason: 'moderation:unknown',
      message: 'photo was refused: moderation:unknown',
    });
  });

  it('match api/refusal-messages.json', async () => {
    await expect(`${JSON.stringify(messages, null, 2)}\n`).toMatchFileSnapshot(
      '../refusal-messages.json',
    );
  });
});
