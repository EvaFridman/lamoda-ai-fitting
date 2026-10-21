import { z } from 'zod';

import { type AiOperation, AiProviderError } from './ai-provider.error.js';
import { abortKind, sleep } from './deadline.js';
import { OPENAI_ORIGIN } from './openai-origin.js';

// The free moderation model of the photo, the text and the result (A15).
export const MODERATION_MODEL = 'omni-moderation-latest';

// Pauses before the second and the third attempt (plan §3: three attempts with backoff for a
// network error, a 429 or a 5xx; none for another 4xx).
const DEFAULT_BACKOFF_MS: readonly number[] = [500, 1500];

// OpenAI's code of the region block (the risk of plan §12): logged once a minute, not on every
// failed call, since every call fails the same way then.
export const REGION_BLOCK_CODE = 'unsupported_country_region_territory';
const REGION_BLOCK_LOG_INTERVAL_MS = 60_000;

// What of an error answer is kept: `error.code` in OpenAI's shape, the request id cut to a length.
// Anything else in those fields (a proxy's page, an echo of the request) stays out of the error,
// the log and Sentry.
const ERROR_CODE_FORMAT = /^[a-z0-9_.-]{1,64}$/i;
const REQUEST_ID_MAX_LENGTH = 64;

// The log lines the client writes: pino's logger, or a stub in tests.
export interface AiLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface OpenAiClientOptions {
  apiKey: string;
  logger: AiLogger;
  // Tests replace the network with recorded answers and shorten the pauses.
  fetch?: typeof globalThis.fetch;
  backoffMs?: readonly number[];
  now?: () => number;
}

export interface CallOptions {
  // The deadline (and the cancellation) of the whole call, every attempt included (A45).
  signal: AbortSignal;
  // Whether a transient failure is tried again here (the default). A Temporal activity that has a
  // retry policy of its own passes false, so the one call is not repeated twice over (plan §4).
  retry?: boolean;
}

export type ModerationInput = { text: string } | { imageUrl: string };

// The answers, parsed only as far as the code reads them; an unknown field is dropped.
const moderationAnswer = z.object({
  results: z
    .array(
      z.object({
        flagged: z.boolean(),
        categories: z.record(z.string(), z.boolean().nullable()),
      }),
    )
    .min(1),
});
export type ModerationAnswer = z.infer<typeof moderationAnswer>;

const responsesAnswer = z.object({
  // `completed`, or `incomplete` with the reason in `incomplete_details` (`max_output_tokens`).
  status: z.string().optional(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            refusal: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type ResponsesAnswer = z.infer<typeof responsesAnswer>;

const imagesAnswer = z.object({
  data: z.array(z.object({ b64_json: z.string().optional() })),
});
export type ImagesAnswer = z.infer<typeof imagesAnswer>;

// The text the model answered, or null when it answered nothing or a refusal.
export function outputText(answer: ResponsesAnswer): string | null {
  for (const item of answer.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text !== undefined) return part.text;
    }
  }
  return null;
}

// Why an answer holds no text, for a warning: its status and, when incomplete, the reason. Never
// the answer's content: both are kept only in OpenAI's shape (`completed`, `max_output_tokens`).
const STATE_WORD = /^[a-z_]{1,32}$/;

export function answerState(answer: ResponsesAnswer): string {
  const status = stateWord(answer.status);
  const reason = answer.incomplete_details?.reason;
  return reason === undefined
    ? `status=${status}`
    : `status=${status}, reason=${stateWord(reason)}`;
}

function stateWord(value: string | undefined): string {
  return value !== undefined && STATE_WORD.test(value) ? value : 'unknown';
}

// OpenAI over Node's fetch (spec 0019 plan §3, no SDK): the edits endpoint (the generation), the
// Responses API (the photo and text classifications) and the moderation endpoint. A failed call
// throws an AiProviderError with the operation, the status, the answer's `error.code` and OpenAI's
// request id; never the input or the key. The key is sent only as the Authorization header, and a
// redirect is refused: a POST followed elsewhere would carry the user's photo or text with it.
export class OpenAiClient {
  private readonly fetch: typeof globalThis.fetch;
  private readonly backoffMs: readonly number[];
  private readonly now: () => number;
  private regionBlockLoggedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: OpenAiClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.now = options.now ?? Date.now;
  }

  // POST /v1/images/edits with a multipart form (`model`, `prompt`, `image[]`, ...; the image
  // model builds it); the answer's `data[0].b64_json` is the picture.
  editImage(form: FormData, options: CallOptions): Promise<ImagesAnswer> {
    return this.request('edit_image', '/v1/images/edits', { body: form }, options, imagesAnswer);
  }

  // POST /v1/responses: a classification in JSON (the caller sets the model, the instructions and
  // the `json_schema` text format).
  respond(body: object, options: CallOptions): Promise<ResponsesAnswer> {
    return this.request('respond', '/v1/responses', json(body), options, responsesAnswer);
  }

  // POST /v1/moderations with the free moderation model, for a text or an image given as a data
  // URL.
  moderate(input: ModerationInput, options: CallOptions): Promise<ModerationAnswer> {
    const body = {
      model: MODERATION_MODEL,
      input:
        'text' in input ? input.text : [{ type: 'image_url', image_url: { url: input.imageUrl } }],
    };
    return this.request('moderate', '/v1/moderations', json(body), options, moderationAnswer);
  }

  private async request<T>(
    operation: AiOperation,
    path: string,
    init: { body: RequestBody; headers?: Record<string, string> },
    { signal, retry = true }: CallOptions,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const attempts = retry ? this.backoffMs.length + 1 : 1;
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetch(`${OPENAI_ORIGIN}${path}`, {
          method: 'POST',
          body: init.body,
          headers: { ...init.headers, Authorization: `Bearer ${this.options.apiKey}` },
          signal,
          redirect: 'error',
        });
      } catch (error) {
        const kind = abortKind(error, signal);
        if (kind !== null) throw new AiProviderError(operation, kind, null, null, null);
        const failure = new AiProviderError(operation, 'network', null, null, null);
        if (attempt >= attempts) throw failure;
        await this.pause(attempt, signal, operation);
        continue;
      }

      const requestId = requestIdOf(response);
      if (response.ok) return this.parse(operation, response, requestId, schema, signal);

      const failure = new AiProviderError(
        operation,
        'http',
        response.status,
        await errorCode(response, signal, operation),
        requestId,
      );
      if (failure.code === REGION_BLOCK_CODE) this.logRegionBlock(failure);
      if (!failure.isTransient || attempt >= attempts) throw failure;
      await this.pause(attempt, signal, operation);
    }
  }

  private async parse<T>(
    operation: AiOperation,
    response: Response,
    requestId: string | null,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      const kind = abortKind(error, signal);
      if (kind !== null) throw new AiProviderError(operation, kind, null, null, null);
      throw new AiProviderError(operation, 'http', response.status, 'malformed_answer', requestId);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AiProviderError(operation, 'http', response.status, 'malformed_answer', requestId);
    }
    return parsed.data;
  }

  // Waits before the next attempt; a deadline that passes meanwhile ends the call.
  private async pause(attempt: number, signal: AbortSignal, operation: AiOperation): Promise<void> {
    try {
      await sleep(this.backoffMs[attempt - 1] ?? 0, signal);
    } catch (error) {
      throw new AiProviderError(operation, abortKind(error, signal) ?? 'aborted', null, null, null);
    }
  }

  private logRegionBlock(failure: AiProviderError): void {
    const now = this.now();
    if (now - this.regionBlockLoggedAt < REGION_BLOCK_LOG_INTERVAL_MS) return;
    this.regionBlockLoggedAt = now;
    this.options.logger.error(
      `OpenAI refuses requests from this server's region (${REGION_BLOCK_CODE}): ${failure.message}`,
    );
  }
}

// What a request carries: a JSON string or the edits endpoint's multipart form.
type RequestBody = string | FormData;

function json(body: object): { body: RequestBody; headers: Record<string, string> } {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

function requestIdOf(response: Response): string | null {
  const id = response.headers.get('x-request-id');
  return id === null || id === '' ? null : id.slice(0, REQUEST_ID_MAX_LENGTH);
}

// `error.code` of an error answer; null when the body is not OpenAI's JSON (a proxy's page) or
// the code is not in OpenAI's shape.
async function errorCode(
  response: Response,
  signal: AbortSignal,
  operation: AiOperation,
): Promise<string | null> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const kind = abortKind(error, signal);
    if (kind !== null) throw new AiProviderError(operation, kind, null, null, null);
    return null;
  }
  const parsed = z
    .object({ error: z.object({ code: z.string().nullable().optional() }) })
    .safeParse(body);
  const code = parsed.success ? parsed.data.error.code : null;
  return typeof code === 'string' && ERROR_CODE_FORMAT.test(code) ? code : null;
}
