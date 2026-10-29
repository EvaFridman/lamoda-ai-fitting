'use client';

import { useRef } from 'react';

import {
  fittingErrorText,
  fittingRefusal,
  type LookFittingRequest,
  type StartedFitting,
  useStartLookFitting,
  useStartSingleFitting,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, SparkleIcon } from '@/shared/ui';

// One start at a time, decided at the click: `isPending` of the render is stale for a second click
// in the same tick, whose `mutate` would replace the first one's callbacks, so the first answer
// would reach nobody while its fitting runs (AC12, A32).
function useInFlight() {
  const ref = useRef(false);
  return {
    take: () => {
      if (ref.current) return false;
      ref.current = true;
      return true;
    },
    release: () => {
      ref.current = false;
    },
  };
}

export interface StartFittingButtonProps {
  // The chosen photo; none yet keeps the button off.
  photoId: string | null;
  productId: string;
  // The colour; left out, the product's own.
  attributeValueId?: string;
  disabled?: boolean;
  // At the click, before the request: the window shows the wait at once (spec 0024 AC19).
  onStart?: () => void;
  onStarted: (fitting: StartedFitting) => void;
  // The api refused at the month's limit (409 `LIMIT_REACHED`).
  onLimit: () => void;
  // Any other failure, in Russian; `null` when a new start begins.
  onError: (text: string | null) => void;
}

// «Примерить» (board 13's TryOnButton: primary, 56, the sparkle; 48 on a phone, board 3): starts the
// try-on of the chosen photo and item. The button is busy while its request runs, so a second
// click starts nothing (spec 0019 AC12, A32).
export function StartFittingButton({
  photoId,
  productId,
  attributeValueId,
  disabled = false,
  onStart,
  onStarted,
  onLimit,
  onError,
}: StartFittingButtonProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const start = useStartSingleFitting();
  const inFlight = useInFlight();
  const tracked = useTrackedElement('try-on.start');

  return (
    <Button
      size={phone ? 48 : 56}
      fullWidth
      disabled={disabled || photoId === null}
      loading={start.isPending}
      onClick={() => {
        tracked.onClick();
        if (photoId === null || !inFlight.take()) return;
        onError(null);
        onStart?.();
        start.mutate(
          { photoId, productId, attributeValueId, source: 'picker' },
          {
            onSettled: inFlight.release,
            onSuccess: (fitting) => onStarted(fitting),
            onError: (failure) => {
              if (fittingRefusal(failure) === 'limit_reached') onLimit();
              else onError(fittingErrorText(failure));
            },
          },
        );
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <SparkleIcon />
      Примерить
    </Button>
  );
}

export interface StartLookButtonProps {
  // The chosen photo; none yet keeps the button off.
  photoId: string | null;
  // The room's items in their colours, 2 to 5 of distinct slots.
  items: LookFittingRequest['items'];
  // The wishes of the room (A90.5); blank is none.
  promptText: string;
  disabled?: boolean;
  onStart?: () => void;
  onStarted: (fitting: StartedFitting) => void;
  onLimit: () => void;
  onError: (text: string | null) => void;
}

// «Примерить образ» (board 3.2): the look's try-on, busy while its request runs (AC12, A32), as
// «Примерить» is.
export function StartLookButton({
  photoId,
  items,
  promptText,
  disabled = false,
  onStart,
  onStarted,
  onLimit,
  onError,
}: StartLookButtonProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const start = useStartLookFitting();
  const inFlight = useInFlight();
  const tracked = useTrackedElement('try-on.start');

  return (
    <Button
      size={phone ? 48 : 56}
      fullWidth
      disabled={disabled || photoId === null || items.length < 2}
      loading={start.isPending}
      onClick={() => {
        tracked.onClick();
        if (photoId === null || !inFlight.take()) return;
        onError(null);
        onStart?.();
        start.mutate(
          { photoId, items, promptText, source: 'picker' },
          {
            onSettled: inFlight.release,
            onSuccess: (fitting) => onStarted(fitting),
            onError: (failure) => {
              if (fittingRefusal(failure) === 'limit_reached') onLimit();
              else onError(fittingErrorText(failure));
            },
          },
        );
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <SparkleIcon />
      Примерить образ
    </Button>
  );
}
