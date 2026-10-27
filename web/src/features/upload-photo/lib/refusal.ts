import { type SafetyCategory, safetyCategorySchema } from '@/entities/fitting';
import { ApiError } from '@/shared/api';

// The check's reasons as the api names them in the detail `PHOTO_REFUSED`'s message (spec 0019
// plan §5, `photo was refused: child`; a flagged photo `moderation:<category>`, spec 0023 plan
// §3.5), and `other` for a reason this page does not know.
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

/** A refused photo: the reason (`Photo Refused`'s) and, for `moderation`, its safety category. */
export interface Refusal {
  reason: RefusalReason;
  category: SafetyCategory | null;
}

const MESSAGE = /refused: ([a-z_]+)(?::([a-z_]+))?$/;

/** The refusal of a photo, or `null` for any other failure. */
export function photoRefusal(error: unknown): Refusal | null {
  if (!(error instanceof ApiError) || error.kind !== 'http' || error.status !== 400) return null;
  const detail = error.details.find((candidate) => candidate.code === 'PHOTO_REFUSED');
  if (!detail) return null;
  const [, name, category] = MESSAGE.exec(detail.message) ?? [];
  const reason = REFUSAL_REASONS.find((known) => known === name) ?? 'other';
  if (reason !== 'moderation') return { reason, category: null };
  const parsed = safetyCategorySchema.safeParse(category);
  return { reason, category: parsed.success ? parsed.data : 'unknown' };
}

export interface RefusalText {
  title: string;
  advice: string;
}

// The screens of board 5, one per reason. Without the canvas's crop and «Мы ошиблись? Сообщить»
// (A41); an unknown reason gets the general text of `PHOTO_REFUSED`.
export const REFUSAL_TEXTS: Readonly<Record<Exclude<RefusalReason, 'moderation'>, RefusalText>> = {
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
  other: {
    title: 'Фото не подходит для примерки',
    advice: 'Загрузите другое фото, где вы видны в полный рост.',
  },
};

// A flagged photo, by its safety category (spec 0023 plan §4.5): what is wrong and what helps,
// never who refused it.
export const SAFETY_REFUSAL_TEXTS: Readonly<Record<SafetyCategory, RefusalText>> = {
  sexual: {
    title: 'Фото не подходит для примерки',
    advice: 'Похоже, на фото откровенный образ. Загрузите фото в одежде, в полный рост.',
  },
  minors: {
    title: 'Похоже, на фото ребёнок',
    advice: 'Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.',
  },
  violence: {
    title: 'На фото есть оружие или насилие',
    advice: 'Загрузите обычное фото в полный рост, без предметов в руках.',
  },
  self_harm: {
    title: 'Фото не подходит для примерки',
    advice: 'Загрузите другое фото, где вы видны в полный рост.',
  },
  hate: {
    title: 'На фото есть оскорбительные символы',
    advice: 'Загрузите фото без надписей, символов и жестов.',
  },
  illicit: {
    title: 'На фото есть запрещённые предметы',
    advice: 'Загрузите фото без посторонних предметов.',
  },
  unknown: {
    title: 'Фото не прошло проверку безопасности',
    advice:
      'Так бывает с фото известных людей и персонажей, в костюме, с оружием или в откровенном образе. Загрузите своё обычное фото в полный рост.',
  },
};

/** The title and advice of a refusal's screen. */
export function refusalText({ reason, category }: Refusal): RefusalText {
  return reason === 'moderation'
    ? SAFETY_REFUSAL_TEXTS[category ?? 'unknown']
    : REFUSAL_TEXTS[reason];
}

/** A refusal whose photo is not shown again and that offers no camera: one of a child. */
export function isChildRefusal({ reason, category }: Refusal): boolean {
  return reason === 'child' || category === 'minors';
}
