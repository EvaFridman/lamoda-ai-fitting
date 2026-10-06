import 'server-only';

import type { z } from 'zod';

import { getServerEnv } from '@/shared/config';

const TIMEOUT_MS = 5000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The only way server code calls the api: over the internal network (API_URL), with a timeout, and
// with the response checked against a schema, so a changed api fails here and not deep in a page.
export async function apiFetch<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  const url = new URL(path, getServerEnv().API_URL);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new ApiError(`api unreachable: ${url.pathname}: ${String(error)}`);
  }
  if (!response.ok) {
    throw new ApiError(`api answered ${response.status}: ${url.pathname}`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(`unexpected api response: ${url.pathname}: ${parsed.error.message}`);
  }
  return parsed.data;
}
