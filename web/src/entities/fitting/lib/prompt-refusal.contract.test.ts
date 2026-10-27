import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';
import { refusalMessages } from '@/shared/contract';

import { promptRefusalReason } from './prompt-refusal';

const { PROMPT_REFUSED } = refusalMessages();

function refused(field: string, message: string) {
  return new ApiError('failed', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 400,
    code: 'PROMPT_REFUSED',
    details: [{ field, code: 'PROMPT_REFUSED', message }],
  });
}

describe('promptRefusalReason against the api messages', () => {
  it('has messages to check', () => {
    expect(PROMPT_REFUSED.length).toBeGreaterThan(10);
  });

  it.each(PROMPT_REFUSED.map((entry) => [entry.message, entry] as const))(
    'reads %s',
    (_message, entry) => {
      // `moderation:unknown` reads as the parser's own fallback; the other categories pin the shape.
      const expected = entry.reason.replace(/^moderation:/, '');

      expect(promptRefusalReason(refused(entry.field, entry.message))).toBe(expected);
    },
  );
});
