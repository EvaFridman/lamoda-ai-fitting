import type { z } from 'zod';

import {
  ApiError,
  type ApiErrorDetail,
  type ApiErrorKind,
  errorCodeOnlySchema,
  errorEnvelopeSchema,
} from './api-error';
import type { ApiPath } from './path';
import { reportApiError, type ReportContext } from './report';

// `AbortSignal.timeout` rejects with a `TimeoutError`; anything else that stops fetch is the network.
function failureKind(error: unknown): ApiErrorKind {
  return error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
}

// The caller's own signal stopped the request (TanStack Query cancels a query nobody waits for):
// not a failure, so it is thrown as it is, neither an `ApiError` nor reported.
function isCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// The api's envelope of an error answer, or undefined for anything else (an HTML page of nginx or
// the dev rewrite, H27; a body cut short): the answer stays an `http` error with its status, only without a code. A cut body is
// not a `timeout` or `network` error, since the status has arrived and its text and retry follow it
// (H30). An envelope whose `details` do not parse keeps its code, with no details.
async function errorEnvelope(
  response: Response,
): Promise<{ code: string; details: ApiErrorDetail[] } | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isCancelled(error)) throw error;
    return undefined;
  }
  const full = errorEnvelopeSchema.safeParse(body);
  if (full.success) return full.data.error;
  const codeOnly = errorCodeOnlySchema.safeParse(body);
  return codeOnly.success ? { code: codeOnly.data.error.code, details: [] } : undefined;
}

// The answer of a file (the result's picture, spec 0023 plan §4.3): its bytes and the name of its
// `Content-Disposition`, if any.
export const BLOB_ANSWER = { kind: 'blob' } as const;

export interface BlobAnswer {
  blob: Blob;
  fileName: string | null;
}

// A schema, `null` for an answer with no body (a 204, spec 0017 plan §4), or `BLOB_ANSWER` for a
// file.
export type ResponseSchema = z.ZodType | null | typeof BLOB_ANSWER;

export type Parsed<Schema extends ResponseSchema> = Schema extends z.ZodType
  ? z.infer<Schema>
  : Schema extends typeof BLOB_ANSWER
    ? BlobAnswer
    : undefined;

// The name of `attachment; filename="primerka-….webp"`: the plain form the api sends, nothing
// else (no `filename*`).
export function attachmentName(header: string | null): string | null {
  const match = header && /filename="([^"\\/]+)"/i.exec(header);
  return match ? (match[1] ?? null) : null;
}

// The step both clients share once they have built the url and the request options: fetch, then the
// status and the schema, every failure an `ApiError` with its kind and reported to Sentry (plan §3),
// so both classify and report errors the same way. An answer of `expectedStatus` is thrown but not
// reported: the caller expects it and handles it.
export async function callApi<Schema extends ResponseSchema>(
  url: URL,
  path: ApiPath,
  schema: Schema,
  init: RequestInit,
  context: ReportContext = {},
  expectedStatus?: number,
): Promise<Parsed<Schema>> {
  try {
    return await request(url, path, schema, init);
  } catch (error) {
    if (error instanceof ApiError && !isExpected(error, expectedStatus)) {
      reportApiError(error, context);
    }
    throw error;
  }
}

// A 5xx is an outage whatever the caller expects: always reported.
function isExpected(error: ApiError, expectedStatus: number | undefined): boolean {
  return (
    expectedStatus !== undefined &&
    expectedStatus < 500 &&
    error.kind === 'http' &&
    error.status === expectedStatus
  );
}

async function request<Schema extends ResponseSchema>(
  url: URL,
  path: ApiPath,
  schema: Schema,
  init: RequestInit,
): Promise<Parsed<Schema>> {
  // Messages name the template, never the path: its params may come from input, and logs and
  // Sentry should group by route.
  const { template } = path;
  const method = (init.method ?? 'GET').toUpperCase();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isCancelled(error)) throw error;
    const kind = failureKind(error);
    const message =
      kind === 'timeout' ? `api timed out: ${template}` : `api unreachable: ${template}`;
    throw new ApiError(`${message}: ${String(error)}`, { kind, template, method, cause: error });
  }
  if (!response.ok) {
    const envelope = await errorEnvelope(response);
    throw new ApiError(`api answered ${response.status}: ${template}`, {
      kind: 'http',
      template,
      method,
      status: response.status,
      code: envelope?.code,
      details: envelope?.details,
    });
  }
  // A caller that expects no body gets nothing on a 204, and the body is not read. Any other answer
  // goes on as before: with no schema to parse it, it fails below as `schema`.
  if (schema === null && response.status === 204) return undefined as Parsed<Schema>;
  if (schema === BLOB_ANSWER) {
    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (error) {
      if (isCancelled(error)) throw error;
      // The status has arrived: the bytes were cut short or ran out of time.
      throw new ApiError(`unreadable api response: ${template}: ${String(error)}`, {
        kind: failureKind(error),
        template,
        method,
        cause: error,
      });
    }
    const answer: BlobAnswer = {
      blob,
      fileName: attachmentName(response.headers.get('Content-Disposition')),
    };
    return answer as Parsed<Schema>;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isCancelled(error)) throw error;
    // A body that is not JSON (an HTML page) is a wrong answer; one cut short is a lost answer.
    const kind = error instanceof SyntaxError ? 'schema' : failureKind(error);
    throw new ApiError(`unreadable api response: ${template}: ${String(error)}`, {
      kind,
      template,
      method,
      cause: error,
    });
  }
  if (schema === null) {
    throw new ApiError(`unexpected api response: ${template}: ${response.status} with a body`, {
      kind: 'schema',
      template,
      method,
    });
  }
  const parsed = (schema as z.ZodType).safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`unexpected api response: ${template}: ${parsed.error.message}`, {
      kind: 'schema',
      template,
      method,
    });
  }
  return parsed.data as Parsed<Schema>;
}
