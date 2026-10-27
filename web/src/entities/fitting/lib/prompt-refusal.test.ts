import { describe, expect, it } from 'vitest';

import { ApiError, errorText } from '@/shared/api';

import { fittingErrorText, promptRefusalReason, promptRefusalText } from './prompt-refusal';

const GENERAL = 'Текст не подходит для примерки: опишите посадку, стиль, фон или позу';

function refused(message: string, field = 'promptText'): ApiError {
  return new ApiError('refused', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 400,
    code: 'PROMPT_REFUSED',
    details: [{ field, code: 'PROMPT_REFUSED', message }],
  });
}

function other(code: string): ApiError {
  return new ApiError('x', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 409,
    code,
  });
}

describe('promptRefusalText', () => {
  it.each([
    ['other_people', 'Пожелание не может касаться других людей на фото'],
    ['nudity', 'Пожелание не может касаться обнажённого тела'],
    ['minors', 'Пожелание не может касаться детей'],
    ['violence', 'Пожелание не может касаться насилия'],
    ['politics', 'Пожелание не может касаться политики, религии и оскорблений'],
    [
      'unrelated',
      'Опишите образ: посадку, стиль, фон, позу или дополнения. Лицо, фигуру и сами вещи изменить нельзя',
    ],
  ])('gives the text of %s', (reason, text) => {
    expect(promptRefusalText(refused(`promptText was refused: ${reason}`))).toBe(text);
  });

  it.each([
    ['sexual', 'Пожелание не может касаться обнажённого тела'],
    ['minors', 'Пожелание не может касаться детей'],
    ['violence', 'Пожелание не может касаться насилия'],
    ['self_harm', 'Пожелание не может касаться насилия'],
    ['hate', 'Пожелание не может касаться политики, религии и оскорблений'],
    ['illicit', 'Пожелание не может касаться запрещённых вещей'],
    ['unknown', GENERAL],
  ])('gives the text of moderation:%s', (category, text) => {
    expect(
      promptRefusalText(refused(`comment was refused: moderation:${category}`, 'comment')),
    ).toBe(text);
  });

  it('gives the general text for an unknown reason', () => {
    expect(promptRefusalText(refused('promptText was refused: weather'))).toBe(GENERAL);
    expect(promptRefusalText(refused('promptText was refused: moderation:weather'))).toBe(GENERAL);
  });

  it('gives the general text when the detail is missing or unreadable', () => {
    expect(promptRefusalText(other('PROMPT_REFUSED'))).toBe(GENERAL);
    expect(promptRefusalText(refused('nonsense'))).toBe(GENERAL);
  });

  it('gives null for any other failure', () => {
    expect(promptRefusalText(other('LIMIT_REACHED'))).toBeNull();
    expect(promptRefusalText(new Error('boom'))).toBeNull();
    expect(
      promptRefusalText(new ApiError('x', { kind: 'network', template: '/fittings' })),
    ).toBeNull();
  });
});

describe('promptRefusalReason', () => {
  it('reads the reason, with or without moderation:', () => {
    expect(promptRefusalReason(refused('promptText was refused: nudity'))).toBe('nudity');
    expect(promptRefusalReason(refused('promptText was refused: moderation:hate'))).toBe('hate');
  });

  it('is null for a failure that is not a refused text', () => {
    expect(promptRefusalReason(other('NOT_COMPLETED'))).toBeNull();
  });
});

describe('fittingErrorText', () => {
  it('gives a refused text its reason text', () => {
    expect(fittingErrorText(refused('comment was refused: minors', 'comment'))).toBe(
      'Пожелание не может касаться детей',
    );
  });

  it('gives any other failure the api code text', () => {
    const error = other('LIMIT_REACHED');
    expect(fittingErrorText(error)).toBe(errorText(error));
  });
});
