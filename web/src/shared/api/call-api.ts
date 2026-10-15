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

// The api's envelope of an error answer, or undefined for anything else (an nginx HTML page, a body
// cut short): the answer stays an `http` error with its status, only without a code. A cut body is
// not a `timeout` or `network` error, since the status has arrived and its text and retry follow it
// (H30). An envelope whose `details` do not parse keeps its code, with no details.
async function errorEnvelope(
  response: Response,
): Promise<{ code: string; details: ApiErrorDetail[] } | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  const full = errorEnvelopeSchema.safeParse(body);
  if (full.success) return full.data.error;
  const codeOnly = errorCodeOnlySchema.safeParse(body);
  return codeOnly.success ? { code: codeOnly.data.error.code, details: [] } : undefined;
}

// The step both clients share once they have built the url and the request options: fetch, then the
// status and the schema, every failure an `ApiError` with its kind and reported to Sentry (plan §3),
// so both classify and report errors the same way.
export async function callApi<Schema extends z.ZodType>(
  url: URL,
  path: ApiPath,
  schema: Schema,
  init: RequestInit,
  context: ReportContext = {},
): Promise<z.infer<Schema>> {
  try {
    return await request(url, path, schema, init);
  } catch (error) {
    if (error instanceof ApiError) reportApiError(error, context);
    throw error;
  }
}

async function request<Schema extends z.ZodType>(
  url: URL,
  path: ApiPath,
  schema: Schema,
  init: RequestInit,
): Promise<z.infer<Schema>> {
  // Messages name the template, never the path: its params may come from input, and logs and
  // Sentry should group by route.
  const { template } = path;
  const method = (init.method ?? 'GET').toUpperCase();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
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
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    // A body that is not JSON (an nginx page) is a wrong answer; one cut short is a lost answer.
    const kind = error instanceof SyntaxError ? 'schema' : failureKind(error);
    throw new ApiError(`unreadable api response: ${template}: ${String(error)}`, {
      kind,
      template,
      method,
      cause: error,
    });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`unexpected api response: ${template}: ${parsed.error.message}`, {
      kind: 'schema',
      template,
      method,
    });
  }
  return parsed.data;
}
