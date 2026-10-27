import { ApiError, type ApiErrorDetail } from './api-error';

// The Russian texts of api failures (spec 0007 H8, plan §2). The api's `message` is English, for
// developers; the visitor sees the text chosen here by `code`.

// Anything without a text of its own: an unknown code, an answer without the api's envelope (but
// the statuses of H27), a response that does not match its schema (AC9) and a path refused before
// any request (H17).
export const GENERAL_TEXT = 'Что-то пошло не так, попробуйте позже';

const TOO_MANY_REQUESTS_TEXT = 'Слишком много запросов, подождите немного';

// One text per code of the api's `ErrorCode` (api/src/common/errors/error-codes.ts). A copy: the
// contract test fails when the api has a code this list lacks, or this list one the api lacks.
export const ERROR_TEXTS = {
  VALIDATION_FAILED: 'Некоторые данные указаны неверно',
  BAD_JSON: 'Не удалось прочитать запрос, обновите страницу',
  INVALID_ID: 'Неверная ссылка',
  RELATED_NOT_FOUND: 'Связанная запись не найдена, возможно, её удалили',
  CONSTRAINT_VIOLATION: 'Некоторые значения недопустимы',
  // Catalog reads are public, so a 401 there is an api bug, not an ended session (H23).
  UNAUTHORIZED: GENERAL_TEXT,
  // web called a route the api lacks: a bug in web, not something the visitor asked for.
  ROUTE_NOT_FOUND: GENERAL_TEXT,
  NOT_FOUND: 'Не найдено: возможно, запись удалили',
  ALREADY_EXISTS: 'Такая запись уже есть',
  IN_USE: 'Нельзя удалить: запись используется',
  // A per-user limit (spec 0019 plan §5): a sixth saved fitting photo, the month's try-ons.
  LIMIT_REACHED: 'Достигнут лимит, больше добавить нельзя',
  // A fitting's text the check refused (spec 0019 A16); entities/fitting's table names the reason.
  PROMPT_REFUSED: 'Текст не подходит для примерки: опишите посадку, стиль, фон или позу',
  // A regeneration whose photo was deleted, or of a result not ready (spec 0019 A70).
  PHOTO_GONE: 'Фото этой примерки удалено — выберите фото и примерьте заново',
  NOT_COMPLETED: 'Перегенерировать можно только готовый результат',
  PAYLOAD_TOO_LARGE: 'Слишком много данных в одном запросе',
  TOO_MANY_REQUESTS: TOO_MANY_REQUESTS_TEXT,
  SERVICE_UNAVAILABLE: 'Сервис временно недоступен, попробуйте позже',
  INTERNAL_ERROR: 'Ошибка на сервере, попробуйте позже',
} as const satisfies Record<string, string>;

// The template of every sign-in route: the client of Better Auth calls them by their full path,
// while the api's own templates never start with /api.
export const AUTH_TEMPLATE_PREFIX = '/api/auth/';

// The codes of /api/auth (spec 0013 N17, N26, N28, N32) with a text of their own: the limits'
// answers, in the api's format or Better Auth's, and Better Auth's unexpected failure. Its other
// codes (a refused callback, an unknown provider, a route outside the list, a body it cannot read)
// mean a bug in web: the general text. Kept apart from ERROR_TEXTS, whose `NOT_FOUND` and
// `UNAUTHORIZED` mean something else there.
export const AUTH_ERROR_TEXTS = {
  PAYLOAD_TOO_LARGE: ERROR_TEXTS.PAYLOAD_TOO_LARGE,
  SERVICE_UNAVAILABLE: ERROR_TEXTS.SERVICE_UNAVAILABLE,
  INTERNAL_SERVER_ERROR: ERROR_TEXTS.INTERNAL_ERROR,
} as const satisfies Record<string, string>;

// A sign-in that failed after leaving for Google comes back to its page with Better Auth's `error`
// code in the address (spec 0013 N54): the visitor's own refusal at Google (`access_denied`) has a
// text of its own, any other code means the sign-in broke.
const SIGN_IN_CANCELLED_TEXT = 'Вход отменён';
const SIGN_IN_FAILED_TEXT = 'Не удалось войти, попробуйте ещё раз';

export function signInRedirectText(code: string): string {
  return code === 'access_denied' ? SIGN_IN_CANCELLED_TEXT : SIGN_IN_FAILED_TEXT;
}

// The api code an answer without the envelope stands for, a fallback: on `/api/` nginx answers
// these in the api's format, but another nginx page or the local dev rewrite may not (H27).
const STATUS_CODES = new Map<number, keyof typeof ERROR_TEXTS>([
  [413, 'PAYLOAD_TOO_LARGE'],
  [502, 'SERVICE_UNAVAILABLE'],
  [503, 'SERVICE_UNAVAILABLE'],
  [504, 'SERVICE_UNAVAILABLE'],
]);

// Failures with no answer from the api.
const NETWORK_TEXT = 'Нет связи с сервером, попробуйте позже';
const TIMEOUT_TEXT = 'Сервер не ответил вовремя, попробуйте позже';

// The text for a caught error, whatever it is: components render only this (plan §3).
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERAL_TEXT;
  switch (error.kind) {
    case 'network':
      return NETWORK_TEXT;
    case 'timeout':
      return TIMEOUT_TEXT;
    case 'http': {
      // By status, envelope or not: nginx's own limit answers 429 too, without `Retry-After`,
      // which is not read anyway (H25).
      if (error.status === 429) return TOO_MANY_REQUESTS_TEXT;
      const texts = error.template.startsWith(AUTH_TEMPLATE_PREFIX)
        ? AUTH_ERROR_TEXTS
        : ERROR_TEXTS;
      const code = error.code ?? STATUS_CODES.get(error.status ?? 0);
      return textOf(texts, code) ?? GENERAL_TEXT;
    }
    case 'schema':
    case 'path':
      return GENERAL_TEXT;
  }
}

// A field's broken rule. The codes are class-validator's rule names in upper snake case
// (api/src/common/validation/), the database rules' codes (common/filters/to-app-exception.ts),
// `INVALID_ID` of a path id, `INVALID_CURSOR` of the product list's cursor
// (products/dto/product-list-query.dto.ts), `MATCHES_STATUS` of a generation's status and result
// (ai-generations/generation-triple.ts), `IN_OWNER_FOLDER` of a file key outside the owner's
// folder (storage/owner-check.ts, spec 0011 M8), `IS_IMAGE` and `PHOTO_REFUSED` of a fitting
// photo (me/photos, spec 0019 plan §5: a file that is not a JPG, PNG or WebP, and a photo the
// check refused, its reason in the message; `CONSENT_REQUIRED` of an upload with no consents, spec
// 0023 Y17), `PROMPT_REFUSED` of a fitting's refused text (its reason in the message, spec 0023 plan
// §3.5), `HAS_SLOT` and `DISTINCT_SLOTS` of a fitting's items
// (fittings, spec 0019 A70: an item outside the fitting room's slots, two items of a look in one
// slot), `MATCHES_SLOT` of a fitting room's item (me/fitting-room, A86: a product of another slot)
// and `TOO_MANY_ERRORS` of a cut list (spec 0006 F14).
export const DETAIL_TEXTS = {
  IS_STRING: 'Должно быть текстом',
  IS_NUMBER: 'Должно быть числом',
  IS_INT: 'Должно быть целым числом',
  IS_BOOLEAN: 'Должно быть «да» или «нет»',
  IS_ARRAY: 'Должно быть списком',
  IS_UUID: 'Неверный идентификатор',
  IS_ENUM: 'Недопустимое значение',
  IS_IN: 'Недопустимое значение',
  IS_POSITIVE: 'Должно быть больше нуля',
  MIN: 'Слишком маленькое значение',
  MAX: 'Слишком большое значение',
  MIN_LENGTH: 'Слишком короткое значение',
  MAX_LENGTH: 'Слишком длинное значение',
  MAX_DECIMAL_PLACES: 'Слишком много знаков после запятой',
  MATCHES: 'Неверный формат',
  ARRAY_MIN_SIZE: 'Слишком мало значений',
  ARRAY_MAX_SIZE: 'Слишком много значений',
  ARRAY_UNIQUE: 'Значения повторяются',
  NESTED_VALIDATION: 'Неверный формат значения',
  IS_USER_EMAIL: 'Неверный адрес почты',
  IS_PERSON_NAME: 'От 2 до 50 букв, между ними можно пробел, дефис или апостроф',
  IS_DATE_OF_BIRTH: 'Дата с 01.01.1900, возраст не меньше 14 лет',
  IS_NOT_BELOW: 'Не может быть меньше нижней границы',
  INVALID_CURSOR: 'Список устарел, обновите страницу',
  WHITELIST_VALIDATION: 'Неизвестное поле',
  INVALID_ID: 'Неверный идентификатор',
  ALREADY_EXISTS: 'Это значение уже занято',
  RELATED_NOT_FOUND: 'Связанная запись не найдена',
  CONSTRAINT_VIOLATION: 'Недопустимое значение',
  MATCHES_STATUS: 'Не соответствует статусу генерации',
  IN_OWNER_FOLDER: 'Файл принадлежит другому пользователю или ещё не загружен',
  IS_IMAGE: 'Нужно изображение JPG, PNG или WebP',
  PHOTO_REFUSED: 'Фото не подходит для примерки',
  CONSENT_REQUIRED: 'Подтвердите согласия перед загрузкой фото',
  PROMPT_REFUSED: 'Текст не подходит для примерки: опишите посадку, стиль, фон или позу',
  HAS_SLOT: 'Эту вещь пока нельзя примерить',
  DISTINCT_SLOTS: 'В образе может быть только одна вещь каждого типа',
  MATCHES_SLOT: 'Эта вещь для другого слота',
  TOO_MANY_ERRORS: 'И другие ошибки',
} as const satisfies Record<string, string>;

const GENERAL_DETAIL_TEXT = 'Неверное значение';

export function detailText(detail: ApiErrorDetail): string {
  return textOf(DETAIL_TEXTS, detail.code) ?? GENERAL_DETAIL_TEXT;
}

// Own keys only: a code like `constructor` or `__proto__` must not reach Object.prototype.
function textOf(texts: Record<string, string>, code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(texts, code) ? texts[code] : undefined;
}
