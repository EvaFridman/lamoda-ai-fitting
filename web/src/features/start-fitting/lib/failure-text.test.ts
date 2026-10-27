import { describe, expect, it } from 'vitest';

import { failureText } from './failure-text';

describe('failureText', () => {
  it('words a model timeout', () => {
    expect(failureText('model_timeout', null, null)).toEqual({
      title: 'Не получилось примерить',
      text: 'Сервис примерки не ответил вовремя. Так бывает при большой нагрузке — попробуйте ещё раз через минуту.',
    });
  });

  it('words a provider error', () => {
    expect(failureText('provider_error', null, null)).toEqual({
      title: 'Сервис примерки недоступен',
      text: 'Попробуйте ещё раз через несколько минут.',
    });
  });

  it('gives the codes no generation ends with the general failure', () => {
    expect(failureText('photo_dark', null, null).title).toBe('Сервис примерки недоступен');
  });

  it.each(['sexual', 'minors', 'violence', 'self_harm', 'hate', 'illicit', 'unknown'] as const)(
    'refuses the output the same for %s',
    (category) => {
      expect(failureText('moderation', category, 'output')).toEqual({
        title: 'Не можем показать результат',
        text: 'Изображение не прошло проверку безопасности. Чаще всего помогает другое фото — в полный рост и в простой одежде.',
      });
    },
  );

  it.each([
    [
      'sexual',
      'Похоже, на фото или в вещах откровенный образ. Загрузите фото в одежде, в полный рост.',
    ],
    [
      'minors',
      'Похоже, на фото ребёнок. Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.',
    ],
    [
      'violence',
      'На фото или в вещах есть оружие или насилие. Загрузите обычное фото в полный рост, без предметов в руках.',
    ],
    [
      'self_harm',
      'Фото или вещи не подходят для примерки. Загрузите другое фото, где вы видны в полный рост.',
    ],
    [
      'hate',
      'На фото или в вещах есть оскорбительные символы. Загрузите фото без надписей, символов и жестов.',
    ],
    [
      'illicit',
      'На фото или в вещах есть запрещённые предметы. Загрузите фото без посторонних предметов.',
    ],
    [
      'unknown',
      'Фото или выбранные вещи не прошли проверку безопасности. Так бывает с фото известных людей и персонажей, в костюме или в откровенном образе. Попробуйте другое фото.',
    ],
  ] as const)('refuses the input by the category %s', (category, text) => {
    expect(failureText('moderation', category, 'input')).toEqual({
      title: 'Не можем сделать примерку',
      text,
    });
  });

  it('reads a missing category as unknown, and a missing stage as input', () => {
    const unknown = failureText('moderation', 'unknown', 'input');
    expect(failureText('moderation', null, 'input')).toEqual(unknown);
    expect(failureText('moderation', null, null)).toEqual(unknown);
    expect(failureText('moderation', 'violence', null).title).toBe('Не можем сделать примерку');
  });
});
