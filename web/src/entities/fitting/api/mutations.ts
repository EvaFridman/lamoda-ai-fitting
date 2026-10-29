import { useMutation, useQueryClient } from '@tanstack/react-query';

import { isStartRetryable, reportFailure } from '@/shared/api';

import {
  type FittingStartSource,
  startRetryCause,
  type StartRetryCause,
  trackFittingRefused,
  trackFittingStarted,
  trackStartRetried,
} from '../model/analytics';
import type {
  Fitting,
  FittingKind,
  RegenerateFittingBody,
  StartedFitting,
  StartFittingBody,
} from '../model/schemas';
import { regenerateFitting, startFitting } from './fitting-requests';
import { fittingKeys } from './keys';

// A try-on of one item (spec 0019 T15): the photo, the product and its colour (left out: the
// product's own).
export interface SingleFittingRequest {
  photoId: string;
  productId: string;
  attributeValueId?: string;
  source: Exclude<FittingStartSource, 'regenerate'>;
}

// A try-on of a look (spec 0019 T26): the photo, 2 to 5 items of distinct slots in their colours,
// and the wishes (A90.5; a colour change sends the result's again, A92.1).
export interface LookFittingRequest {
  photoId: string;
  items: { productId: string; attributeValueId: string | null }[];
  promptText: string | null;
  source: Exclude<FittingStartSource, 'regenerate'>;
}

export interface RegenerateRequest extends RegenerateFittingBody {
  // The result to regenerate, and its kind (a regeneration keeps it, A70).
  parentId: string;
  kind: FittingKind;
  // «Перегенерировать», or «Попробовать ещё раз» of a failed regeneration.
  source: Extract<FittingStartSource, 'regenerate' | 'retry'>;
  // Whether the user typed a comment, when the sent one holds more (a look's item, A92.2);
  // left out, whether a comment is sent.
  withComment?: boolean;
}

// After a start: the fitting's own entry holds the answer (its screen opens without a read), and
// the lists and the quota are read again, not awaited: the next screen does not wait for them.
function useStarted() {
  const queryClient = useQueryClient();
  return (started: StartedFitting) => {
    const { repeated: _repeated, ...fitting } = started;
    queryClient.setQueryData(fittingKeys.detail(started.id), fitting);
    void queryClient.invalidateQueries({
      queryKey: fittingKeys.all,
      predicate: (query) => query.queryKey[2] !== 'detail' || query.queryKey[3] !== started.id,
    });
  };
}

function refused(failure: unknown, kind: 'single' | 'look') {
  // A refusal of the limit or of the text is an answer, shown by the caller; any other failure is
  // reported (an `ApiError` already is).
  if (!trackFittingRefused(failure, kind)) reportFailure(failure);
}

// The silent retry of a start (spec 0024 Z10, Z26.6, Z27; why this write may repeat:
// `isStartRetryable`): once, 1.5 s later, so the expensive tier's one request a second does not
// answer the repeat with a 429. `onError` runs only after the last attempt, so the screen does not
// change in between. `networkMode: 'always'`: offline, the attempts fail at once and the error card
// shows, where the default would wait, still pending, for the network to come back.
const START_RETRY = {
  retry: (failureCount: number, error: unknown) => failureCount < 1 && isStartRetryable(error),
  retryDelay: 1500,
  networkMode: 'always',
} as const;

// The cause of a start's first failure, while it is being sent again: TanStack Query passes the
// same variables to every attempt, and `onSettled` sends `Fitting Start Retried` with it.
const retryCauses = new WeakMap<object, StartRetryCause>();

async function attempt<R>(variables: object, request: () => Promise<R>): Promise<R> {
  try {
    return await request();
  } catch (failure) {
    const cause = startRetryCause(failure);
    if (cause && !retryCauses.has(variables)) retryCauses.set(variables, cause);
    throw failure;
  }
}

function settledRetry(
  kind: FittingKind,
  request: object,
  source: FittingStartSource,
  error: unknown,
) {
  const cause = retryCauses.get(request);
  if (!cause) return;
  retryCauses.delete(request);
  trackStartRetried(kind, source, cause, error);
}

// Starts a try-on of one item. Nothing kept (`gcTime: 0`); repeated only by `START_RETRY`.
export function useStartSingleFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: (request: SingleFittingRequest) =>
      attempt(request, () => {
        const { photoId, productId, attributeValueId } = request;
        return startFitting({
          photoId,
          kind: 'single',
          items: [attributeValueId ? { productId, attributeValueId } : { productId }],
        });
      }),
    ...START_RETRY,
    gcTime: 0,
    onSuccess: (fitting, { source }) => {
      trackFittingStarted(fitting, source, false);
      started(fitting);
    },
    onError: (failure) => refused(failure, 'single'),
    onSettled: (_fitting, error, request) => settledRetry('single', request, request.source, error),
  });
}

// Starts a try-on of a look, as `useStartSingleFitting` does one item.
export function useStartLookFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: (request: LookFittingRequest) =>
      attempt(request, () => {
        const { photoId, items, promptText } = request;
        const wishes = promptText?.trim();
        return startFitting({
          photoId,
          kind: 'look',
          items: items.map(({ productId, attributeValueId }) =>
            attributeValueId ? { productId, attributeValueId } : { productId },
          ),
          ...(wishes ? { promptText: wishes } : {}),
        });
      }),
    ...START_RETRY,
    gcTime: 0,
    onSuccess: (fitting, { promptText, source }) => {
      trackFittingStarted(fitting, source, Boolean(promptText?.trim()));
      started(fitting);
    },
    onError: (failure) => refused(failure, 'look'),
    onSettled: (_fitting, error, request) => settledRetry('look', request, request.source, error),
  });
}

// «Примерить ещё раз» of a history entry (spec 0019 A7, A93): the same photo, items, colours and
// wishes; null once the photo is gone, which leaves nothing to send.
export function repeatBody(
  fitting: Pick<Fitting, 'kind' | 'photoId' | 'items' | 'promptText'>,
): StartFittingBody | null {
  if (fitting.photoId === null) return null;
  const wishes = fitting.promptText?.trim();
  return {
    photoId: fitting.photoId,
    kind: fitting.kind,
    items: fitting.items.map(({ productId, attributeValueId }) =>
      attributeValueId ? { productId, attributeValueId } : { productId },
    ),
    ...(wishes ? { promptText: wishes } : {}),
  };
}

// Tries a history entry on again: an earlier result of the same photo, items and wishes answers
// `repeated` and spends nothing (A7), a failed entry's starts a new generation.
export function useRepeatFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: (body: StartFittingBody) => attempt(body, () => startFitting(body)),
    ...START_RETRY,
    gcTime: 0,
    onSuccess: (fitting, body) => {
      trackFittingStarted(fitting, 'history', Boolean(body.promptText));
      started(fitting);
    },
    onError: (failure, body) => refused(failure, body.kind),
    onSettled: (_fitting, error, body) => settledRetry(body.kind, body, 'history', error),
  });
}

// Regenerates a result with the comment of «Что поменять?», if any.
export function useRegenerateFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: (request: RegenerateRequest) =>
      attempt(request, () =>
        regenerateFitting(request.parentId, request.comment ? { comment: request.comment } : {}),
      ),
    ...START_RETRY,
    gcTime: 0,
    onSuccess: (fitting, { comment, withComment, source }) => {
      trackFittingStarted(fitting, source, withComment ?? Boolean(comment));
      started(fitting);
    },
    onError: (failure, { kind }) => refused(failure, kind),
    onSettled: (_fitting, error, request) =>
      settledRetry(request.kind, request, request.source, error),
  });
}
