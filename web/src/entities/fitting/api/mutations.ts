import { useMutation, useQueryClient } from '@tanstack/react-query';

import { reportFailure } from '@/shared/api';

import {
  type FittingStartSource,
  trackFittingRefused,
  trackFittingStarted,
} from '../model/analytics';
import type { FittingKind, RegenerateFittingBody, StartedFitting } from '../model/schemas';
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

// Starts a try-on of one item. A mutation with no retry, nothing kept (`gcTime: 0`): a start may
// spend a try-on, and a write is never repeated by itself.
export function useStartSingleFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: ({ photoId, productId, attributeValueId }: SingleFittingRequest) =>
      startFitting({
        photoId,
        kind: 'single',
        items: [attributeValueId ? { productId, attributeValueId } : { productId }],
      }),
    retry: false,
    gcTime: 0,
    onSuccess: (fitting, { source }) => {
      trackFittingStarted(fitting, source, false);
      started(fitting);
    },
    onError: (failure) => refused(failure, 'single'),
  });
}

// Starts a try-on of a look, as `useStartSingleFitting` does one item.
export function useStartLookFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: ({ photoId, items, promptText }: LookFittingRequest) => {
      const wishes = promptText?.trim();
      return startFitting({
        photoId,
        kind: 'look',
        items: items.map(({ productId, attributeValueId }) =>
          attributeValueId ? { productId, attributeValueId } : { productId },
        ),
        ...(wishes ? { promptText: wishes } : {}),
      });
    },
    retry: false,
    gcTime: 0,
    onSuccess: (fitting, { promptText, source }) => {
      trackFittingStarted(fitting, source, Boolean(promptText?.trim()));
      started(fitting);
    },
    onError: (failure) => refused(failure, 'look'),
  });
}

// Regenerates a result with the reasons and the comment of «Что поменять?».
export function useRegenerateFitting() {
  const started = useStarted();
  return useMutation({
    mutationFn: ({ parentId, reasons, comment }: RegenerateRequest) =>
      regenerateFitting(parentId, comment ? { reasons, comment } : { reasons }),
    retry: false,
    gcTime: 0,
    onSuccess: (fitting, { comment, withComment, source }) => {
      trackFittingStarted(fitting, source, withComment ?? Boolean(comment));
      started(fitting);
    },
    onError: (failure, { kind }) => refused(failure, kind),
  });
}
