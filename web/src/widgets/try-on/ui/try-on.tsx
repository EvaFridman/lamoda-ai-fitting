'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  type Fitting,
  fittingKeys,
  fittingQueryOptions,
  fittingRefusal,
  fittingsInfiniteQueryOptions,
  isFittingRunning,
  showFitting,
  type StartedFitting,
  trackFittingOutcome,
  useFittingQuota,
  useRegenerateFitting,
  useStartSingleFitting,
  watchFitting,
} from '@/entities/fitting';
import { productOptions } from '@/entities/product';
import { deleteTransientPhoto, useMyPhotos, type UserPhoto } from '@/entities/user-photo';
import { FittingErrorCard, FittingWait, LimitCard } from '@/features/start-fitting';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { FITTINGS_HREF } from '@/shared/config';
import { Button, Modal, Notice, Skeleton } from '@/shared/ui';

import { productColours, triedColours } from '../lib/colours';
import { FittingResult } from './fitting-result';
import { PhotoPicker } from './photo-picker';

import styles from './try-on.module.scss';

// A one-time photo is deleted when the window closes (A69, A70); a 404 (gone already, or a saved
// one) is nothing to report.
function dropTransient(id: string) {
  deleteTransientPhoto(id).catch((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 404) return;
    reportFailure(failure);
  });
}

export interface TryOnProps {
  // The item to try on; or, with `fittingId`, the item of that fitting.
  productId?: string;
  // A fitting to open at once: its wait, result or error.
  fittingId?: string;
  onClose: () => void;
}

// The try-on window of one item (spec 0019 T15, plan §7, boards 3, 5, 6, 7, 11, 12): the photo
// picker, the wait, the result with the other colours and the regeneration, the limit and error
// cards, in one place that owns the flow's state. Rendered while open: closing unmounts it, which
// deletes a one-time photo uploaded here (a fitting that runs keeps it, A70). A fitting it shows
// gives no toast (A11); its end is sent to the analytics by this tab (A75).
export function TryOn({
  productId: givenProductId,
  fittingId: givenFittingId,
  onClose,
}: TryOnProps) {
  const queryClient = useQueryClient();
  const [fittingId, setFittingId] = useState<string | null>(givenFittingId ?? null);
  // The result a colour runs over (board 7.2).
  const [baseId, setBaseId] = useState<string | null>(null);
  const [picking, setPicking] = useState(givenFittingId === undefined);
  const [limited, setLimited] = useState(false);
  // The one-time photos uploaded here, the last one in the picker's strip.
  const [transients, setTransients] = useState<UserPhoto[]>([]);
  const transient = transients.at(-1) ?? null;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const fittingQuery = useQuery({
    ...fittingQueryOptions(fittingId ?? ''),
    enabled: fittingId !== null,
  });
  const fitting = fittingId === null ? undefined : fittingQuery.data;
  const baseQuery = useQuery({ ...fittingQueryOptions(baseId ?? ''), enabled: baseId !== null });
  const productId = givenProductId ?? fitting?.items[0]?.productId;
  const productQuery = useQuery({
    ...productOptions(productId ?? ''),
    enabled: productId !== undefined,
  });
  const product = productQuery.data;
  const photos = useMyPhotos();
  const quota = useFittingQuota();
  const showsResult = !picking && fitting?.status === 'completed';
  const history = useInfiniteQuery({
    ...fittingsInfiniteQueryOptions('single'),
    enabled: showsResult || baseId !== null,
  });
  const start = useStartSingleFitting();
  const regenerate = useRegenerateFitting();

  // The default photo is chosen until another is (A63.4).
  const chosen =
    chosenId ?? photos.data?.find((photo) => photo.isDefault)?.id ?? photos.data?.[0]?.id ?? null;

  // The one-time photos go with the window, every one uploaded here.
  const transientsRef = useRef<UserPhoto[]>([]);
  useEffect(() => {
    transientsRef.current = transients;
  }, [transients]);
  useEffect(
    () => () => {
      for (const photo of transientsRef.current) dropTransient(photo.id);
    },
    [],
  );

  // A fitting this window shows: no toast for it, and its end is this tab's to send.
  useEffect(() => (fittingId ? showFitting(fittingId) : undefined), [fittingId]);
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (!fitting) return;
    if (isFittingRunning(fitting)) {
      watchFitting(fitting.id);
      wasRunningRef.current = true;
      return;
    }
    trackFittingOutcome(fitting);
    if (wasRunningRef.current) {
      // A failed fitting gives its try-on back; any end changes the history.
      wasRunningRef.current = false;
      void queryClient.invalidateQueries({
        queryKey: fittingKeys.all,
        predicate: (query) => query.queryKey[2] !== 'detail',
      });
    }
  }, [fitting, queryClient]);

  // `base`: the result a colour runs over (board 7.2), shown while the colour runs.
  function started(next: StartedFitting, base: string | null = null) {
    setRetryError(null);
    setLimited(false);
    setPicking(false);
    setBaseId(base);
    setFittingId(next.id);
  }

  function startedColour(next: StartedFitting) {
    started(next, !next.repeated && fitting?.status === 'completed' ? fitting.id : null);
  }

  function reachedLimit() {
    setLimited(true);
    void queryClient.invalidateQueries({ queryKey: fittingKeys.quota });
  }

  // «Попробовать ещё раз» of a failed fitting: a try-on starts again with its photo, item and
  // colour; a regeneration regenerates its result again (its reasons are not kept, so «Другое»).
  // With its photo gone it goes back to the picker.
  function retry(failed: Fitting) {
    const item = failed.items[0];
    const onError = (failure: unknown) => {
      if (fittingRefusal(failure) === 'limit_reached') reachedLimit();
      else setRetryError(errorText(failure));
    };
    if (failed.photoId === null || !item) {
      setPicking(true);
      return;
    }
    if (failed.parentId !== null) {
      regenerate.mutate(
        { parentId: failed.parentId, kind: failed.kind, reasons: ['other'], source: 'retry' },
        { onSuccess: (next) => started(next), onError },
      );
      return;
    }
    start.mutate(
      {
        photoId: failed.photoId,
        productId: item.productId,
        attributeValueId: item.attributeValueId ?? undefined,
        source: 'retry',
      },
      { onSuccess: (next) => started(next), onError },
    );
  }

  // The photo a fitting uses: a saved one, or the one-time one of this window.
  function photoUrl(id: string | null): string | null {
    if (id === null) return null;
    return [...transients, ...(photos.data ?? [])].find((photo) => photo.id === id)?.url ?? null;
  }

  const colours = productColours(product);
  // The picker keeps the colour of the result it came back from («Примерить на другом фото»).
  const shownColour = fitting?.items[0]?.attributeValueId;
  const pickerColour = colours.find((colour) => colour.id === shownColour) ?? colours[0];
  const loadedFittings = history.data?.pages.flatMap((page) => page.items) ?? [];

  let content;
  let description: string | undefined;
  if (limited || (picking && quota.data?.left === 0)) {
    content = quota.data ? (
      <LimitCard quota={quota.data} historyHref={FITTINGS_HREF} />
    ) : (
      <Skeleton height={320} />
    );
  } else if (picking) {
    description = 'Изображение приблизительное: модель ещё учится';
    content = productQuery.isError ? (
      <div className={styles.failed}>
        <Notice tone="error" role="alert">
          {errorText(productQuery.error)}
        </Notice>
        <Button variant="outline" onClick={() => void productQuery.refetch()}>
          Повторить
        </Button>
      </div>
    ) : (
      <PhotoPicker
        product={product}
        colour={pickerColour}
        photos={photos.data}
        photosFailed={photos.isError}
        transient={transient}
        onTransient={(photo) => setTransients((list) => [...list, photo])}
        chosenId={chosen}
        onChoose={setChosenId}
        quota={quota.data}
        onStarted={(next) => started(next)}
        onLimit={reachedLimit}
      />
    );
  } else if (!fitting) {
    content = fittingQuery.isError ? (
      <div className={styles.failed}>
        <Notice tone="error" role="alert">
          {errorText(fittingQuery.error)}
        </Notice>
        <Button variant="outline" onClick={() => setPicking(true)} disabled={!productId}>
          Выбрать фото
        </Button>
      </div>
    ) : (
      <Skeleton height={480} />
    );
  } else if (isFittingRunning(fitting) && baseQuery.data) {
    content = (
      <FittingResult
        fitting={baseQuery.data}
        running={fitting}
        product={product}
        colours={colours}
        tried={triedColours(loadedFittings, baseQuery.data.photoId, productId)}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOtherPhoto={() => setPicking(true)}
      />
    );
  } else if (isFittingRunning(fitting)) {
    content = (
      <FittingWait fitting={fitting} photoUrl={photoUrl(fitting.photoId)} onClose={onClose} />
    );
  } else if (fitting.status === 'completed') {
    content = (
      <FittingResult
        fitting={fitting}
        running={null}
        product={product}
        colours={colours}
        tried={triedColours(loadedFittings, fitting.photoId, productId)}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOtherPhoto={() => setPicking(true)}
      />
    );
  } else {
    content = (
      <FittingErrorCard
        failure={fitting.failureCode ?? 'provider_error'}
        left={quota.data?.left}
        photoUrl={photoUrl(fitting.photoId)}
        onRetry={() => retry(fitting)}
        retrying={start.isPending || regenerate.isPending}
        onClose={onClose}
        onOtherPhoto={() => setPicking(true)}
        error={retryError}
      />
    );
  }

  return (
    <Modal
      open
      wide
      title="Онлайн-примерка"
      description={description}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className={styles.body}>{content}</div>
    </Modal>
  );
}
