// What the client was doing when the request failed.
// `list_models` is the deploy's check only (A73); `check_prompt` is the text check reading its
// verdict (spec 0023 Y19).
export type AiOperation = 'edit_image' | 'respond' | 'moderate' | 'list_models' | 'check_prompt';

// Why it failed: the deadline passed (`timeout`), the caller cancelled (`aborted`), no answer
// came (`network`), the answer was an error or unreadable (`http`, with its status), or the text
// check's model answered no verdict it could read (`unreadable_verdict`, Y19).
export type AiFailureReason = 'timeout' | 'aborted' | 'network' | 'http' | 'unreadable_verdict';

// An error answer's `error.moderation_details` (spec 0023 plan §3.5): OpenAI's stage (`input`,
// `output`, `unknown`) and its coarse category labels, as OpenAI wrote them (only words of its
// shape are kept: labels, never the input).
export interface ModerationDetails {
  stage: string | null;
  categories: string[];
}

// A failed request to OpenAI (spec 0019 plan §3). Carries the operation, the reason, the answer's
// status and `error.code`, its moderation details and OpenAI's request id for their support; never
// the input, an image, a prompt or the key, so a log line or a Sentry event of it holds no personal
// data (AC27).
export class AiProviderError extends Error {
  constructor(
    readonly operation: AiOperation,
    readonly reason: AiFailureReason,
    readonly status: number | null,
    readonly code: string | null,
    readonly requestId: string | null,
    readonly moderation: ModerationDetails | null = null,
  ) {
    super(
      `OpenAI ${operation}: ${reason}` +
        (status === null ? '' : ` ${status}`) +
        (code === null ? '' : ` ${code}`) +
        (moderation === null
          ? ''
          : ` [moderation ${moderation.stage ?? 'none'}: ${moderation.categories.join(', ') || 'none'}]`) +
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
