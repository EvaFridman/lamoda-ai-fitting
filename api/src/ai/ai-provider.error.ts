// What the client was doing when the request failed.
// `list_models` is the deploy's check only (A73).
export type AiOperation = 'edit_image' | 'respond' | 'moderate' | 'list_models';

// Why it failed: the deadline passed (`timeout`), the caller cancelled (`aborted`), no answer
// came (`network`) or the answer was an error or unreadable (`http`, with its status).
export type AiFailureReason = 'timeout' | 'aborted' | 'network' | 'http';

// A failed request to OpenAI (spec 0019 plan §3). Carries the operation, the reason, the answer's
// status and `error.code` and OpenAI's request id for their support; never the input, an image,
// a prompt or the key, so a log line or a Sentry event of it holds no personal data (AC27).
export class AiProviderError extends Error {
  constructor(
    readonly operation: AiOperation,
    readonly reason: AiFailureReason,
    readonly status: number | null,
    readonly code: string | null,
    readonly requestId: string | null,
  ) {
    super(
      `OpenAI ${operation}: ${reason}` +
        (status === null ? '' : ` ${status}`) +
        (code === null ? '' : ` ${code}`) +
        (requestId === null ? '' : ` (request ${requestId})`),
    );
    this.name = 'AiProviderError';
  }

  // The deadline of the call passed: a check inside a request answers 503 (A45), a generation is
  // `model_timeout`.
  get isTimeout(): boolean {
    return this.reason === 'timeout';
  }

  // Worth another attempt: no answer, too many requests or the provider's own failure. Another 4xx
  // (a bad request, a refused key, a content refusal) is not, nor the 429 of an exhausted billing
  // quota (`insufficient_quota`), which no pause mends.
  get isTransient(): boolean {
    if (this.reason === 'network') return true;
    if (this.reason !== 'http') return false;
    if (this.status === 429) return this.code !== 'insufficient_quota';
    return (this.status ?? 0) >= 500;
  }
}
