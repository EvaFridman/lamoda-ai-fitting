'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import {
  type Fitting,
  fittingFinishedEvent,
  fittingKeys,
  fittingQueryOptions,
  type FittingFinished,
  isFittingShown,
  itemWord,
  setUnseenCount,
  trackFittingOutcome,
  useStartSingleFitting,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { reportFailure } from '@/shared/api';
import { fittingHref } from '@/shared/config';
import { useRealtimeEvent } from '@/shared/realtime';
import { showToast } from '@/shared/ui';

function itemName(fitting: Fitting): string {
  return itemWord(fitting.items[0]?.name ?? 'вещь');
}

// The push of a finished fitting (spec 0019 A11, A34, A71): a result no window shows adds one to
// the header's badge at once (spec 0024 AC30), then the fittings and the quota are read again, and the fitting itself, since the push is only a signal (A72). Unless an open try-on window
// shows it, a toast says so on whatever page is open: «Примерка готова: <вещь>» with «Открыть», or
// «Примерка не удалась: <вещь>.» (and «Лимит не списан.» unless it counts against the limit,
// A79.3) with «Повторить», which starts the same try-on
// again (a regeneration, or one whose photo is gone, opens its screen instead). The tab that
// started the fitting or saw it running sends its end's event (A75). Mounted once, by the header.
export function useFittingEvents(): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const start = useStartSingleFitting();
  const open = {
    single: useTrackedElement('fitting-toast.open', { kind: 'single' }),
    look: useTrackedElement('fitting-toast.open', { kind: 'look' }),
  };
  const retry = {
    single: useTrackedElement('fitting-toast.retry', { kind: 'single' }),
    look: useTrackedElement('fitting-toast.retry', { kind: 'look' }),
  };

  function retryFitting(fitting: Fitting) {
    const item = fitting.items[0];
    if (
      fitting.kind !== 'single' ||
      fitting.parentId !== null ||
      fitting.photoId === null ||
      !item
    ) {
      router.push(fittingHref(fitting.id));
      return;
    }
    start.mutate(
      {
        photoId: fitting.photoId,
        productId: item.productId,
        attributeValueId: item.attributeValueId ?? undefined,
        source: 'retry',
      },
      {
        onSuccess: (started) => router.push(fittingHref(started.id)),
        // The fitting's screen shows the failure and its own «Попробовать ещё раз».
        onError: () => router.push(fittingHref(fitting.id)),
      },
    );
  }

  async function finished({ generationId, kind, status }: FittingFinished) {
    // A result no window shows is one more not yet seen (spec 0024 AC30): the badge counts it with
    // the toast's moment, before the read below brings the real count (the api's already holds it).
    if (status === 'completed' && !isFittingShown(generationId)) {
      await queryClient.cancelQueries({ queryKey: fittingKeys.quota });
      setUnseenCount(queryClient, (unseen) => unseen + 1);
    }
    await queryClient.invalidateQueries({ queryKey: fittingKeys.all });
    let fitting: Fitting;
    try {
      fitting = await queryClient.fetchQuery(fittingQueryOptions(generationId));
    } catch (failure) {
      reportFailure(failure);
      return;
    }
    trackFittingOutcome(fitting);
    if (isFittingShown(fitting.id)) return;
    const name = kind === 'look' ? '' : itemName(fitting);
    if (fitting.status === 'completed') {
      showToast({
        title: kind === 'look' ? 'Примерка образа готова' : `Примерка готова: ${name}`,
        actionLabel: 'Открыть',
        onAction: () => {
          open[kind].onClick();
          router.push(fittingHref(fitting.id));
        },
      });
    } else if (fitting.status === 'failed') {
      // A cancelled or a stuck fitting stays spent (A47, A68, A79.3).
      const kept = fitting.countsAgainstLimit ? '' : ' Лимит не списан.';
      showToast({
        title:
          kind === 'look'
            ? `Примерка образа не удалась.${kept}`
            : `Примерка не удалась: ${name}.${kept}`,
        tone: 'error',
        actionLabel: 'Повторить',
        onAction: () => {
          retry[kind].onClick();
          retryFitting(fitting);
        },
      });
    }
  }

  useRealtimeEvent(fittingFinishedEvent, (push) => void finished(push));
}
