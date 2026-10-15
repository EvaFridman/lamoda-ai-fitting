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
  PAYLOAD_TOO_LARGE: 'Слишком много данных в одном запросе',
  TOO_MANY_REQUESTS: TOO_MANY_REQUESTS_TEXT,
  SERVICE_UNAVAILABLE: 'Сервис временно недоступен, попробуйте позже',
  INTERNAL_ERROR: 'Ошибка на сервере, попробуйте позже',
} as const satisfies Record<string, string>;

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
      const code = error.code ?? STATUS_CODES.get(error.status ?? 0);
      return textOf(ERROR_TEXTS, code) ?? GENERAL_TEXT;
    }
    case 'schema':
    case 'path':
      return GENERAL_TEXT;
  }
}

// A field's broken rule. The codes are class-validator's rule names in upper snake case
// (api/src/common/validation/), the database rules' codes (common/filters/to-app-exception.ts),
// `INVALID_ID` of a path id, `MATCHES_STATUS` of a generation's status and result
// (ai-generations/generation-triple.ts) and `TOO_MANY_ERRORS` of a cut list (spec 0006 F14).
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
  IS_USER_EMAIL: 'Неверный адрес почты',
  IS_DATE_OF_BIRTH: 'Неверная дата рождения',
  IS_NOT_BELOW: 'Не может быть меньше нижней границы',
  WHITELIST_VALIDATION: 'Неизвестное поле',
  INVALID_ID: 'Неверный идентификатор',
  ALREADY_EXISTS: 'Это значение уже занято',
  RELATED_NOT_FOUND: 'Связанная запись не найдена',
  CONSTRAINT_VIOLATION: 'Недопустимое значение',
  MATCHES_STATUS: 'Не соответствует статусу генерации',
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
