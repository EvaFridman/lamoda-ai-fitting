import type { FittingFailure, ModerationStage, SafetyCategory } from '@/entities/fitting';

export interface FailureText {
  title: string;
  text: string;
}

const TIMEOUT: FailureText = {
  title: 'Не получилось примерить',
  text: 'Сервис примерки не ответил вовремя. Так бывает при большой нагрузке — попробуйте ещё раз через минуту.',
};

const PROVIDER_ERROR: FailureText = {
  title: 'Сервис примерки недоступен',
  text: 'Попробуйте ещё раз через несколько минут.',
};

const OUTPUT_REFUSED: FailureText = {
  title: 'Не можем показать результат',
  text: 'Изображение не прошло проверку безопасности. Чаще всего помогает другое фото — в полный рост и в простой одежде.',
};

// A refusal before the picture was made: the photo table's sentence of its category, naming the
// photo or the items, since the model saw both (spec 0023 plan §4.5).
const INPUT_REFUSED: Readonly<Record<SafetyCategory, string>> = {
  sexual: 'Похоже, на фото или в вещах откровенный образ. Загрузите фото в одежде, в полный рост.',
  minors:
    'Похоже, на фото ребёнок. Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.',
  violence:
    'На фото или в вещах есть оружие или насилие. Загрузите обычное фото в полный рост, без предметов в руках.',
  self_harm:
    'Фото или вещи не подходят для примерки. Загрузите другое фото, где вы видны в полный рост.',
  hate: 'На фото или в вещах есть оскорбительные символы. Загрузите фото без надписей, символов и жестов.',
  illicit:
    'На фото или в вещах есть запрещённые предметы. Загрузите фото без посторонних предметов.',
  unknown:
    'Фото или выбранные вещи не прошли проверку безопасности. Так бывает с фото известных людей и персонажей, в костюме или в откровенном образе. Попробуйте другое фото.',
};

/** The error card's title and text of a failed generation; never says who refused it. */
export function failureText(
  failure: FittingFailure,
  category: SafetyCategory | null,
  stage: ModerationStage | null,
): FailureText {
  if (failure === 'moderation') {
    if (stage === 'output') return OUTPUT_REFUSED;
    return { title: 'Не можем сделать примерку', text: INPUT_REFUSED[category ?? 'unknown'] };
  }
  // Any other code (`provider_error`, and the photo's and the text's, which no generation of this
  // api ends with) is the general failure.
  return failure === 'model_timeout' ? TIMEOUT : PROVIDER_ERROR;
}
