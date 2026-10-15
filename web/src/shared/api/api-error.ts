import { z } from 'zod';

// What went wrong, for the texts the visitor sees and for Sentry:
// - `http`: the api answered with a non-2xx status;
// - `network`: no answer (refused connection, reset, DNS);
// - `timeout`: no answer within the client's timeout;
// - `schema`: an answer that is not JSON or does not match the schema;
// - `path`: a path refused before any request (H17).
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'schema' | 'path';

// The api's own caps (spec 0006 F14, F25): 50 details and a TOO_MANY_ERRORS entry, a `field` of
// 100 and a `message` of 200 code points, up to twice as many UTF-16 units, which zod counts. A
// bigger answer is not the api's and is not carried further (logs, Sentry).
const MAX_DETAILS = 51;
const MAX_FIELD_UNITS = 200;
const MAX_MESSAGE_UNITS = 400;
const MAX_CODE_LENGTH = 64;

const errorCodeSchema = z.string().max(MAX_CODE_LENGTH);

// One entry of the envelope's `details`: the field (a dotted path, empty for `TOO_MANY_ERRORS`) and
// the rule it broke. `code` is a plain string: the api's validation rules are not a closed list.
export const errorDetailSchema = z.object({
  field: z.string().max(MAX_FIELD_UNITS),
  code: errorCodeSchema,
  message: z.string().max(MAX_MESSAGE_UNITS),
});

export type ApiErrorDetail = z.infer<typeof errorDetailSchema>;

// The api's error answer, `{ error: { code, message, details } }` (spec 0004 E19). `code` is a
// plain string too, so a code this web does not know still parses and gets the general text.
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(errorDetailSchema).max(MAX_DETAILS),
  }),
});

// The code alone, for an envelope whose `details` do not parse: the visitor still gets the code's
// text, without the details.
export const errorCodeOnlySchema = z.object({ error: z.object({ code: errorCodeSchema }) });

interface ApiErrorInit {
  kind: ApiErrorKind;
  // The path template (`/products/:id`): groups failures by route, whatever the ids in the path.
  template: string;
  status?: number;
  // From the envelope of an `http` answer; absent when the answer had none (an nginx page).
  code?: string;
  details?: ApiErrorDetail[];
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly template: string;
  readonly status?: number;
  readonly code?: string;
  readonly details: ApiErrorDetail[];

  constructor(
    message: string,
    { kind, template, status, code, details = [], cause }: ApiErrorInit,
  ) {
    super(message, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.template = template;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
