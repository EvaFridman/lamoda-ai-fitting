'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type Fitting,
  fittingKeys,
  fittingQueryOptions,
  fittingErrorText,
  fittingRefusal,
  fittingsInfiniteQueryOptions,
  isFittingRunning,
  showFitting,
  type StartedFitting,
  trackFittingOutcome,
  triesLeftTail,
  useFittingQuota,
  useRegenerateFitting,
  useStartLookFitting,
  useStartSingleFitting,
  watchFitting,
} from '@/entities/fitting';
import { categorySlots, type OutfitSlot, useActiveCategories } from '@/entities/category';
import { openRoom, useFittingRoom, useRoomWishes } from '@/entities/fitting-room';
import { productOptions } from '@/entities/product';
import { useSession } from '@/entities/session';
import { deleteTransientPhoto, useMyPhotos, type UserPhoto } from '@/entities/user-photo';
import {
  FittingErrorCard,
  FittingSuccess,
  FittingWait,
  LimitCard,
  StartFittingButton,
  StartLookButton,
} from '@/features/start-fitting';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { FITTINGS_HREF } from '@/shared/config';
import { Button, Modal, Notice, Skeleton } from '@/shared/ui';

import { productColours, triedColours } from '../lib/colours';
import { FittingResult } from './fitting-result';
import { ItemRow } from './item-row';
import { LookResult } from './look-result';
import { type LookItems, LookSubject, roomLook } from './look-subject';
import { PhotoPicker } from './photo-picker';
import { PickerItemActions } from './picker-item-actions';

import styles from './try-on.module.scss';

// How long the success screen shows before the result (spec 0023 Y15).
const SUCCESS_MS = 1500;

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
  // The look of the fitting room (T26): the picker of board 3.2 with the room's items and wishes.
  look?: boolean;
  // A fitting to open at once: its wait, result or error (a look's too).
  fittingId?: string;
  onClose: () => void;
}

// The try-on window of one item or a look (spec 0019 T15, T26, plan §7, boards 3, 5, 6, 7, 8, 11,
// 12): the photo picker, the wait, the result with the other colours and the regeneration, the
// limit and error cards, in one place that owns the flow's state. Rendered while open: closing
// unmounts it, which deletes a one-time photo uploaded here (a fitting that runs keeps it, A70). A
// fitting it shows gives no toast (A11); its end is sent to the analytics by this tab (A75).
export function TryOn({
  productId: givenProductId,
  look = false,
  fittingId: givenFittingId,
  onClose,
}: TryOnProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.user.id : '';
  // The user the window opened for: an end of the session or another user signed in with no end
  // seen in between closes it, and it shows nothing meanwhile, since its state (a one-time
  // photo's link, the chosen photo) is that user's (spec 0017 U22). A failed read is no end.
  const [ownerId, setOwnerId] = useState<string | null>(userId || null);
  // Opened while the session loads (a link to `?fitting=`): its first user is the owner.
  if (ownerId === null && userId !== '') setOwnerId(userId);
  const foreign =
    (session.status === 'signed-out' && !session.failed) ||
    (ownerId !== null && userId !== '' && userId !== ownerId);
  useEffect(() => {
    if (foreign) onClose();
  }, [foreign, onClose]);
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
  const isLook = look || fitting?.kind === 'look';
  const productId = isLook ? undefined : (givenProductId ?? fitting?.items[0]?.productId);
  // The look's picker tries on the room's items with its wishes (A90.5).
  const room = useFittingRoom(isLook && userId !== '');
  const wishes = useRoomWishes(userId);
  const productQuery = useQuery({
    ...productOptions(productId ?? ''),
    enabled: productId !== undefined,
  });
  const product = productQuery.data;
  // The product's slot of the fitting room, for the result's «К образу»: null none (or either read
  // failed: no tile rather than one that waits for ever), undefined while either loads.
  const categories = useActiveCategories();
  let slot: OutfitSlot | null | undefined;
  if (productQuery.isError || categories.isError) slot = null;
  else if (product && categories.data) {
    slot = categorySlots(categories.data.items).get(product.category.id) ?? null;
  }
  const photos = useMyPhotos();
  const quota = useFittingQuota();
  const showsResult = !picking && fitting?.status === 'completed';
  const history = useInfiniteQuery({
    ...fittingsInfiniteQueryOptions('single'),
    enabled: !isLook && (showsResult || baseId !== null),
  });
  const start = useStartSingleFitting();
  const startLook = useStartLookFitting();
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
  // The fitting whose success screen shows (spec 0023 P26): one seen running in this window that
  // completed; a fitting opened completed never shows it. Kept in state during the render, as
  // `ownerId`.
  const [seenRunning, setSeenRunning] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState<string | null>(null);
  if (fitting && isFittingRunning(fitting) && seenRunning !== fitting.id) {
    setSeenRunning(fitting.id);
  } else if (fitting?.status === 'completed' && seenRunning === fitting.id) {
    setSeenRunning(null);
    setCelebrating(fitting.id);
  }
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
  useEffect(() => {
    if (celebrating === null) return;
    const timer = window.setTimeout(() => setCelebrating(null), SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

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
  // colour; a regeneration regenerates its result again, with no comment (it is not kept).
  // With its photo gone it goes back to the picker.
  function retry(failed: Fitting) {
    const item = failed.items[0];
    const onError = (failure: unknown) => {
      if (fittingRefusal(failure) === 'limit_reached') reachedLimit();
      else setRetryError(fittingErrorText(failure));
    };
    if (failed.photoId === null || !item) {
      setPicking(true);
      return;
    }
    if (failed.parentId !== null) {
      regenerate.mutate(
        { parentId: failed.parentId, kind: failed.kind, source: 'retry' },
        { onSuccess: (next) => started(next), onError },
      );
      return;
    }
    if (failed.kind === 'look') {
      startLook.mutate(
        {
          photoId: failed.photoId,
          items: failed.items.map(({ productId: id, attributeValueId }) => ({
            productId: id,
            attributeValueId,
          })),
          promptText: failed.promptText,
          source: 'retry',
        },
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

  // The window closes first: two dialogs do not stack (A90.12).
  function toRoom() {
    onClose();
    openRoom();
  }

  const pickerProps = {
    photos: photos.data,
    photosFailed: photos.isError,
    transient,
    onTransient: (photo: UserPhoto) => setTransients((list) => [...list, photo]),
    chosenId: chosen,
    onChoose: setChosenId,
    quota: quota.data,
  };

  let content;
  if (limited || (picking && quota.data?.left === 0)) {
    content = quota.data ? (
      <LimitCard quota={quota.data} historyHref={FITTINGS_HREF} onOpenRoom={toRoom} />
    ) : (
      <Skeleton height={320} />
    );
  } else if (picking && isLook) {
    // A look shown here (another photo for it, its failure, the history's) is tried on as it was,
    // with its colours and wishes, as one item keeps its colour (A77.3); else the room's.
    const shownLook = fitting?.kind === 'look' ? fitting : null;
    const pickerLook: LookItems | undefined = shownLook
      ? {
          items: shownLook.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            imageUrl: item.imageUrl,
            price: item.price,
            finalPrice: item.finalPrice,
            attributeValueId: item.attributeValueId,
            colour: item.colour,
          })),
          sum: shownLook.items.reduce((total, item) => total + item.finalPrice, 0),
        }
      : room.data && roomLook(room.data);
    const pickerWishes = shownLook ? (shownLook.promptText ?? '') : wishes;
    content =
      !shownLook && room.isError ? (
        <div className={styles.failed}>
          <Notice tone="error" role="alert">
            {errorText(room.error)}
          </Notice>
          <Button variant="outline" onClick={() => void room.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <PhotoPicker
          {...pickerProps}
          subject={
            pickerLook ? (
              <LookSubject look={pickerLook} onChange={toRoom} />
            ) : (
              <Skeleton height={48} />
            )
          }
          meterText={(left) => `Образ целиком — 1 примерка · ${triesLeftTail(left)}`}
          renderStart={(photoId, onError) => (
            <StartLookButton
              photoId={photoId}
              items={(pickerLook?.items ?? []).map(({ productId: id, attributeValueId }) => ({
                productId: id,
                attributeValueId,
              }))}
              promptText={pickerWishes}
              onStarted={(next) => started(next)}
              onLimit={reachedLimit}
              onError={onError}
            />
          )}
        />
      );
  } else if (picking) {
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
        {...pickerProps}
        subject={
          product ? (
            <ItemRow
              name={product.name}
              imageUrl={product.image?.url ?? null}
              details={pickerColour?.value}
              price={product.price}
              finalPrice={product.finalPrice}
              action={<PickerItemActions kind="single" />}
            />
          ) : (
            <Skeleton height={80} />
          )
        }
        renderStart={(photoId, onError) =>
          product && (
            <StartFittingButton
              photoId={photoId}
              productId={product.id}
              attributeValueId={pickerColour?.id}
              onStarted={(next) => started(next)}
              onLimit={reachedLimit}
              onError={onError}
            />
          )
        }
      />
    );
  } else if (!fitting) {
    content = fittingQuery.isError ? (
      <div className={styles.failed}>
        <Notice tone="error" role="alert">
          {errorText(fittingQuery.error)}
        </Notice>
        <Button variant="outline" onClick={() => setPicking(true)} disabled={!productId && !look}>
          Выбрать фото
        </Button>
      </div>
    ) : (
      <Skeleton height={480} />
    );
  } else if (celebrating === fitting.id && fitting.status === 'completed') {
    content = <FittingSuccess resultUrl={fitting.resultUrl} />;
  } else if (isLook && fitting.status === 'completed') {
    content = (
      <LookResult
        fitting={fitting}
        running={null}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOpenRoom={toRoom}
      />
    );
  } else if (isLook && isFittingRunning(fitting) && baseQuery.data) {
    content = (
      <LookResult
        fitting={baseQuery.data}
        running={fitting}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOpenRoom={toRoom}
      />
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
        slot={slot}
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
        slot={slot}
      />
    );
  } else {
    content = (
      <FittingErrorCard
        failure={fitting.failureCode ?? 'provider_error'}
        category={fitting.failureCategory}
        stage={fitting.failureStage}
        spent={fitting.countsAgainstLimit}
        left={quota.data?.left}
        photoUrl={photoUrl(fitting.photoId)}
        onRetry={() => retry(fitting)}
        retrying={start.isPending || startLook.isPending || regenerate.isPending}
        onClose={onClose}
        onOtherPhoto={() => setPicking(true)}
        error={retryError}
      />
    );
  }

  if (foreign) return null;

  return (
    <TryOnModal title={isLook ? 'Примерка образа' : 'Онлайн-примерка'} onClose={onClose}>
      {content}
    </TryOnModal>
  );
}

interface TryOnModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// The window, whose height follows a new screen smoothly (spec 0023 P10). A new screen unmounts the
// control that had the focus (the regeneration's «Что поменять?» as its sheet closes, «Попробовать ещё раз»), and the browser drops the focus on the
// page's body, out of the window: then it moves to the window, so the keyboard and a screen reader
// stay inside. Checked a moment after the focus leaves or the page's nodes change (a browser may
// drop the focus of a removed node without a `focusout`), once the browser has settled it.
function TryOnModal({ title, onClose, children }: TryOnModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const regain = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.activeElement !== null && document.activeElement !== document.body) return;
        // The window itself, named by its title, as Base UI's own restore does; never while a
        // window over it (the tips, «Что поменять?») holds the focus, which Base UI keeps there.
        const popup = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
        if (!popup || popup.hasAttribute('data-nested-dialog-open')) return;
        popup.focus({ preventScroll: true });
      });
    };
    const observer = new MutationObserver(regain);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('focusout', regain);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusout', regain);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Modal
      open
      wide
      animateSize
      title={title}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div ref={bodyRef} className={styles.body}>
        {children}
      </div>
    </Modal>
  );
}
