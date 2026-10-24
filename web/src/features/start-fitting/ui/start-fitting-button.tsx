'use client';

import { fittingRefusal, type StartedFitting, useStartSingleFitting } from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, SparkleIcon } from '@/shared/ui';

export interface StartFittingButtonProps {
  // The chosen photo; none yet keeps the button off.
  photoId: string | null;
  productId: string;
  // The colour; left out, the product's own.
  attributeValueId?: string;
  disabled?: boolean;
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
  onStarted,
  onLimit,
  onError,
}: StartFittingButtonProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const start = useStartSingleFitting();
  const tracked = useTrackedElement('try-on.start');

  return (
    <Button
      size={phone ? 48 : 56}
      fullWidth
      disabled={disabled || photoId === null}
      loading={start.isPending}
      onClick={() => {
        tracked.onClick();
        if (photoId === null || start.isPending) return;
        onError(null);
        start.mutate(
          { photoId, productId, attributeValueId, source: 'picker' },
          {
            onSuccess: (fitting) => onStarted(fitting),
            onError: (failure) => {
              if (fittingRefusal(failure) === 'limit_reached') onLimit();
              else onError(errorText(failure));
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
