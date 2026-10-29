import { track } from '@/shared/analytics';
import { ApiError, isStartRetryable } from '@/shared/api';

import { promptRefusalReason } from '../lib/prompt-refusal';
import type { Fitting, FittingKind, StartedFitting } from './schemas';

// The fittings' events (spec 0019 plan §9, A43, A75). `Fitting Completed` and `Fitting Failed` are
// sent only by the tab that started the fitting or saw it running, once per fitting, so a second
// open tab that gets the same push does not count it again. Both sets live as long as the tab.
const watched = new Set<string>();
const reported = new Set<string>();

export type FittingStartSource = 'picker' | 'retry' | 'colour' | 'regenerate' | 'history';

const MODELS = ['gpt-image-2', 'gpt-image-2-5-sunburst'] as const;

// The model's name as the catalog's closed list holds it: a dot is no enum value's character, and
// a model the list does not know (the fake one of local stacks) is `other`.
function modelName(model: string): (typeof MODELS)[number] | 'other' {
  const name = model.replaceAll('.', '-');
  return MODELS.find((known) => known === name) ?? 'other';
}

function duration(fitting: Fitting): number {
  if (fitting.finishedAt === null) return 0;
  return Math.max(
    0,
    Math.round((Date.parse(fitting.finishedAt) - Date.parse(fitting.createdAt)) / 1000),
  );
}

// This tab looks at the fitting while it runs (the waiting screen): its end is this tab's to send.
export function watchFitting(id: string): void {
  watched.add(id);
}

// Sends `Fitting Completed` or `Fitting Failed` for a watched fitting that ended, once.
export function trackFittingOutcome(fitting: Fitting): void {
  if (!watched.has(fitting.id) || reported.has(fitting.id)) return;
  if (fitting.status === 'completed') {
    reported.add(fitting.id);
    track('Fitting Completed', {
      kind: fitting.kind,
      model: modelName(fitting.model),
      duration: duration(fitting),
      counts_against_limit: fitting.countsAgainstLimit,
      repeated: false,
    });
  } else if (fitting.status === 'failed' && fitting.failureCode !== null) {
    reported.add(fitting.id);
    track('Fitting Failed', {
      kind: fitting.kind,
      reason: fitting.failureCode,
      model: modelName(fitting.model),
      duration: duration(fitting),
    });
  }
}

// After the api answered a start or a regeneration: `Fitting Started`, and a repeat's result at
// once, each time it is opened again (A43: its duration 0, nothing spent).
export function trackFittingStarted(
  started: StartedFitting,
  source: FittingStartSource,
  withPrompt: boolean,
): void {
  track('Fitting Started', {
    kind: started.kind,
    source,
    items: started.items.length,
    repeated: started.repeated,
    with_prompt: withPrompt,
  });
  watchFitting(started.id);
  if (!started.repeated) return;
  // The result was already there: its own end, sent or not, is not this.
  reported.add(started.id);
  track('Fitting Completed', {
    kind: started.kind,
    model: modelName(started.model),
    duration: 0,
    counts_against_limit: false,
    repeated: true,
  });
}

export type StartRetryCause = 'network' | 'timeout' | 'server';

// Why a start was sent again (spec 0024 plan §6): a failure `isStartRetryable` repeats, in the
// catalog's words; null for any other, which is not repeated.
export function startRetryCause(error: unknown): StartRetryCause | null {
  if (!isStartRetryable(error) || !(error instanceof ApiError)) return null;
  return error.kind === 'http' ? 'server' : error.kind === 'network' ? 'network' : 'timeout';
}

// After a start that was sent again settles: how the repeat ended, `refused` for the limit or the
// text (`Fitting Refused` went too), `failed` for the error card.
export function trackStartRetried(
  kind: FittingKind,
  source: FittingStartSource,
  cause: StartRetryCause,
  error: unknown,
): void {
  const outcome = error === null ? 'started' : fittingRefusal(error) ? 'refused' : 'failed';
  track('Fitting Start Retried', { kind, source, cause, outcome });
}

// A start the api refused before any generation: the month's limit, or a text the check refused.
export function fittingRefusal(error: unknown): 'limit_reached' | 'prompt_refused' | null {
  if (!(error instanceof ApiError) || error.kind !== 'http') return null;
  if (error.code === 'LIMIT_REACHED') return 'limit_reached';
  if (error.code === 'PROMPT_REFUSED') return 'prompt_refused';
  return null;
}

// Sends `Fitting Refused` for such a refusal and gives its reason; null for any other failure.
export function trackFittingRefused(
  error: unknown,
  kind: FittingKind,
): 'limit_reached' | 'prompt_refused' | null {
  const reason = fittingRefusal(error);
  if (reason === 'prompt_refused') {
    track('Fitting Refused', { kind, reason, prompt_reason: promptGroup(error) });
  } else if (reason) track('Fitting Refused', { kind, reason });
  return reason;
}

// A refused text's reason in the catalog's coarse groups (spec 0023 Y11): never `politics` or
// `nudity` on their own, a classification of the user's own text.
function promptGroup(error: unknown): 'other_people' | 'minors' | 'unsafe' | 'off_topic' {
  switch (promptRefusalReason(error)) {
    case 'other_people':
      return 'other_people';
    case 'minors':
      return 'minors';
    case 'nudity':
    case 'violence':
    case 'sexual':
    case 'self_harm':
    case 'hate':
    case 'illicit':
      return 'unsafe';
    default:
      return 'off_topic';
  }
}
