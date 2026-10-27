import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';
import { refusalMessages } from '@/shared/contract';

import { photoRefusal } from './refusal';

const { PHOTO_REFUSED } = refusalMessages();

function refused(message: string) {
  return new ApiError('failed', {
    kind: 'http',
    template: '/me/photos',
    method: 'POST',
    status: 400,
    code: 'VALIDATION_FAILED',
    details: [{ field: 'photo', code: 'PHOTO_REFUSED', message }],
  });
}

describe('photoRefusal against the api messages', () => {
  it('has messages to check', () => {
    expect(PHOTO_REFUSED.length).toBeGreaterThan(5);
  });

  it.each(PHOTO_REFUSED.map((entry) => [entry.message, entry] as const))(
    'reads %s',
    (_message, entry) => {
      const refusal = photoRefusal(refused(entry.message));

      if (entry.reason.startsWith('moderation:')) {
        expect(refusal).toEqual({
          reason: 'moderation',
          category: entry.reason.slice('moderation:'.length),
        });
      } else {
        expect(refusal).toEqual({ reason: entry.reason, category: null });
      }
    },
  );
});
