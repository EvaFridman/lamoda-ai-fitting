import { ApiError } from '@/shared/api';

// The check's reasons as the api names them in the detail `PHOTO_REFUSED`'s message (spec 0019
// plan §5, `photo was refused: child`), and `other` for a reason this page does not know.
export const REFUSAL_REASONS = [
  'dark',
  'not_full',
  'many_people',
  'child',
  'no_person',
  'moderation',
  'other',
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

const MESSAGE = /refused: ([a-z_]+)$/;

/** The reason of a refused photo, or `null` for any other failure. */
export function refusalReason(error: unknown): RefusalReason | null {
  if (!(error instanceof ApiError) || error.kind !== 'http' || error.status !== 400) return null;
  const detail = error.details.find((candidate) => candidate.code === 'PHOTO_REFUSED');
  if (!detail) return null;
  const reason = MESSAGE.exec(detail.message)?.[1];
  return REFUSAL_REASONS.find((known) => known === reason) ?? 'other';
}

export interface RefusalText {
  title: string;
  advice: string;
}

// The screens of board 5, one per reason. Without the canvas's crop and «Мы ошиблись? Сообщить»
// (A41); a flagged photo and an unknown reason get the general text of `PHOTO_REFUSED`.
export const REFUSAL_TEXTS: Readonly<Record<RefusalReason, RefusalText>> = {
  dark: {
    title: 'Фото слишком тёмное',
    advice: 'Встаньте у окна днём или включите верхний свет.',
  },
  not_full: {
    title: 'Не видно фигуру целиком',
    advice:
      'Нужно фото от макушки до стоп. Отойдите от камеры на 2–3 шага или поставьте телефон на уровень пояса.',
  },
  many_people: {
    title: 'На фото несколько человек',
    advice:
      'Оставьте в кадре только себя или обрежьте фото так, чтобы были видны только вы — в полный рост.',
  },
  child: {
    title: 'Похоже, на фото ребёнок',
    advice: 'Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.',
  },
  no_person: {
    title: 'Не нашли человека на фото',
    advice: 'Загрузите фото, где вы видны в полный рост.',
  },
  moderation: {
    title: 'Фото не подходит для примерки',
    advice: 'Загрузите другое фото, где вы видны в полный рост.',
  },
  other: {
    title: 'Фото не подходит для примерки',
    advice: 'Загрузите другое фото, где вы видны в полный рост.',
  },
};
