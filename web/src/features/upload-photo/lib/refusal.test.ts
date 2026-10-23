import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { REFUSAL_REASONS, REFUSAL_TEXTS, refusalReason } from './refusal';

function refused(message: string, status = 400): ApiError {
  return new ApiError('failed', {
    kind: 'http',
    template: '/me/photos',
    method: 'POST',
    status,
    code: 'VALIDATION_FAILED',
    details: [{ field: 'photo', code: 'PHOTO_REFUSED', message }],
  });
}

describe('refusalReason', () => {
  it.each(['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation'])(
    'reads the known reason %s',
    (reason) => {
      expect(refusalReason(refused(`photo was refused: ${reason}`))).toBe(reason);
    },
  );

  it.each(['something_new', 'other'])('turns the reason %s into other', (reason) => {
    expect(refusalReason(refused(`photo was refused: ${reason}`))).toBe('other');
  });

  it('turns a message without a reason into other', () => {
    expect(refusalReason(refused('photo was refused'))).toBe('other');
  });

  it('is null for a status other than 400', () => {
    expect(refusalReason(refused('photo was refused: child', 503))).toBeNull();
  });

  it('is null for a 400 with another detail', () => {
    const error = new ApiError('failed', {
      kind: 'http',
      template: '/me/photos',
      status: 400,
      details: [{ field: 'photo', code: 'IS_IMAGE', message: 'photo must be an image' }],
    });
    expect(refusalReason(error)).toBeNull();
  });

  it('is null for a network error and for anything that is not an ApiError', () => {
    expect(
      refusalReason(new ApiError('x', { kind: 'network', template: '/me/photos' })),
    ).toBeNull();
    expect(refusalReason(new Error('photo was refused: child'))).toBeNull();
    expect(refusalReason(undefined)).toBeNull();
  });
});

describe('REFUSAL_TEXTS', () => {
  it('has a title and advice for every reason', () => {
    for (const reason of REFUSAL_REASONS) {
      expect(REFUSAL_TEXTS[reason].title).not.toBe('');
      expect(REFUSAL_TEXTS[reason].advice).not.toBe('');
    }
  });
});
