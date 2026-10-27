import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import {
  isChildRefusal,
  photoRefusal,
  REFUSAL_REASONS,
  REFUSAL_TEXTS,
  refusalText,
  SAFETY_REFUSAL_TEXTS,
} from './refusal';

const refusalReason = (error: unknown) => photoRefusal(error)?.reason ?? null;

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

describe('photoRefusal', () => {
  it.each(['sexual', 'minors', 'violence', 'self_harm', 'hate', 'illicit', 'unknown'])(
    'reads moderation:%s as a moderation refusal of that category',
    (category) => {
      expect(photoRefusal(refused(`photo was refused: moderation:${category}`))).toEqual({
        reason: 'moderation',
        category,
      });
    },
  );

  it('turns an unknown or missing category into unknown', () => {
    expect(photoRefusal(refused('photo was refused: moderation:weapons'))).toEqual({
      reason: 'moderation',
      category: 'unknown',
    });
    expect(photoRefusal(refused('photo was refused: moderation'))).toEqual({
      reason: 'moderation',
      category: 'unknown',
    });
  });

  it('has no category for the check’s own reasons', () => {
    expect(photoRefusal(refused('photo was refused: dark'))).toEqual({
      reason: 'dark',
      category: null,
    });
  });

  it('is null for a failure that is not a refusal', () => {
    expect(photoRefusal(refused('photo was refused: child', 503))).toBeNull();
    expect(photoRefusal(new Error('x'))).toBeNull();
  });
});

describe('REFUSAL_TEXTS', () => {
  it('has a title and advice for every reason but moderation', () => {
    for (const reason of REFUSAL_REASONS) {
      if (reason === 'moderation') continue;
      expect(REFUSAL_TEXTS[reason].title).not.toBe('');
      expect(REFUSAL_TEXTS[reason].advice).not.toBe('');
    }
  });
});

describe('refusalText', () => {
  it.each([
    [
      'sexual',
      'Фото не подходит для примерки',
      'Похоже, на фото откровенный образ. Загрузите фото в одежде, в полный рост.',
    ],
    [
      'minors',
      'Похоже, на фото ребёнок',
      'Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.',
    ],
    [
      'violence',
      'На фото есть оружие или насилие',
      'Загрузите обычное фото в полный рост, без предметов в руках.',
    ],
    [
      'self_harm',
      'Фото не подходит для примерки',
      'Загрузите другое фото, где вы видны в полный рост.',
    ],
    [
      'hate',
      'На фото есть оскорбительные символы',
      'Загрузите фото без надписей, символов и жестов.',
    ],
    ['illicit', 'На фото есть запрещённые предметы', 'Загрузите фото без посторонних предметов.'],
    [
      'unknown',
      'Фото не прошло проверку безопасности',
      'Так бывает с фото известных людей и персонажей, в костюме, с оружием или в откровенном образе. Загрузите своё обычное фото в полный рост.',
    ],
  ] as const)('gives the %s category its text', (category, title, advice) => {
    expect(refusalText({ reason: 'moderation', category })).toEqual({ title, advice });
    expect(SAFETY_REFUSAL_TEXTS[category]).toEqual({ title, advice });
  });

  it('gives a moderation refusal with no category the unknown text', () => {
    expect(refusalText({ reason: 'moderation', category: null })).toEqual(
      SAFETY_REFUSAL_TEXTS.unknown,
    );
  });

  it('gives the check’s own reasons their texts', () => {
    expect(refusalText({ reason: 'dark', category: null })).toEqual(REFUSAL_TEXTS.dark);
  });
});

describe('isChildRefusal', () => {
  it('holds for child and for the minors category only', () => {
    expect(isChildRefusal({ reason: 'child', category: null })).toBe(true);
    expect(isChildRefusal({ reason: 'moderation', category: 'minors' })).toBe(true);
    expect(isChildRefusal({ reason: 'moderation', category: 'violence' })).toBe(false);
    expect(isChildRefusal({ reason: 'dark', category: null })).toBe(false);
  });
});
