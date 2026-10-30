'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import {
  type Fitting,
  fittingKeys,
  fittingQueryOptions,
  fittingErrorText,
  fittingRefusal,
  fittingsInfiniteQueryOptions,
  isFittingRunning,
  keptOrigin,
  showFitting,
  type StartedFitting,
  trackFittingOutcome,
  triesLeftTail,
  useFittingQuota,
  useMarkFittingSeen,
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
import { anchoredPanelOpen, Button, Modal, Notice, Skeleton } from '@/shared/ui';

import { productColours, triedColours } from '../lib/colours';
import type { ResultPhotoProps } from '../model/result-photo';
import { pendingFitting, type Starting, startingNow, type StartIntent } from '../model/starting';
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
  // The photos whose result's save switch went off in this window (spec 0024 AC22).
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  // The chosen photo: undefined the default one (A63.4), null none («Примерить на другом фото»,
  // spec 0024 AC17).
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined);
  const [retryError, setRetryError] = useState<string | null>(null);
  // A start clicked here whose answer has not come (spec 0024 AC19): its wait shows at once. The
  // ref holds it for the answer's callbacks, made in the render before the click.
  const [starting, setStarting] = useState<Starting | null>(null);
  const startingRef = useRef<Starting | null>(null);
  // The fitting such a start became and its click: the progress goes on from the click.
  const [origin, setOrigin] = useState<{ id: string; at: number } | null>(null);

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
  // The product's slot of the fitting room, for the result's «Добавить к образу»: null none (or
  // either read failed: no button rather than one that waits for ever), undefined while either
  // loads.
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

  // The default photo is chosen until another is (A63.4) or none is.
  const chosen =
    chosenId === undefined
      ? (photos.data?.find((photo) => photo.isDefault)?.id ?? photos.data?.[0]?.id ?? null)
      : chosenId;

  // The one-time photos go with the window, every one uploaded here.
  const transientsRef = useRef<UserPhoto[]>([]);
  useEffect(() => {
    transientsRef.current = transients;
  }, [transients]);
  // But the one a start on its way uses: the delete could reach the api before the fitting that
  // keeps it (A70), and the housekeeping deletes it within the hour if the start fails (A24). So
  // too the one a result's save switch is keeping (spec 0024 AC22).
  // Keeps on their way by photo, counted: a second switch may keep the same photo before the
  // first answers. An unkeep on its way leaves its photo to the housekeeping (A24).
  const keepingRef = useRef(new Map<string, number>());
  const markKeeping = useCallback((id: string, keeping: boolean) => {
    const count = (keepingRef.current.get(id) ?? 0) + (keeping ? 1 : -1);
    if (count > 0) keepingRef.current.set(id, count);
    else keepingRef.current.delete(id);
  }, []);
  useEffect(
    () => () => {
      for (const photo of transientsRef.current) {
        if (photo.id === startingRef.current?.photoId || keepingRef.current.has(photo.id)) {
          continue;
        }
        dropTransient(photo.id);
      }
    },
    [],
  );

  // A fitting this window shows: no toast for it, and its end is this tab's to send.
  useEffect(() => (fittingId ? showFitting(fittingId) : undefined), [fittingId]);
  // Completed here, «Готово!» or the result: the header's badge does not count it (spec 0024
  // AC30), even when the window closes during the success screen.
  useMarkFittingSeen(fitting?.status === 'completed' ? fitting.id : null);
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

  // A start clicked: its wait shows before the api answers (spec 0024 AC19).
  function beginStart(intent: StartIntent) {
    const next = startingNow(intent);
    startingRef.current = next;
    setStarting(next);
  }

  // It failed or reached the limit: its wait goes, and the screen it came from says why.
  function endStart() {
    startingRef.current = null;
    setStarting(null);
  }

  // `base`: the result a colour runs over (board 7.2), shown while the colour runs.
  function started(next: StartedFitting, base: string | null = null) {
    // The wait counted on the default estimate until now: the real one keeps its share. A fitting
    // that was already running (A32) goes on from its own start when that is further on.
    const clicked = startingRef.current;
    if (clicked) {
      setOrigin({
        id: next.id,
        at: Math.min(
          keptOrigin(clicked.at, null, next.estimatedSeconds, Date.now()),
          Date.parse(next.createdAt),
        ),
      });
    }
    endStart();
    setRetryError(null);
    setLimited(false);
    setPicking(false);
    setBaseId(base);
    setFittingId(next.id);
  }

  function startedColour(next: StartedFitting) {
    started(next, !next.repeated && fitting?.status === 'completed' ? fitting.id : null);
  }

  // The picker's start failed: the picker comes back with its notice (`null` clears it at a start).
  function startFailed(onError: (text: string | null) => void) {
    return (text: string | null) => {
      if (text !== null) endStart();
      onError(text);
    };
  }

  function reachedLimit() {
    endStart();
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

  // A result's save switch (spec 0024 AC22): a kept photo leaves the one-time photos, so the close
  // does not delete it, and comes back to them when the switch goes off. A photo whose switch went
  // off stays declined for the window: the next result on it (a colour, a regeneration) does not
  // keep it by itself.
  function resultPhoto(shown: Fitting): ResultPhotoProps {
    return {
      uploadedHere: transients.some((photo) => photo.id === shown.photoId),
      declined: shown.photoId !== null && declinedIds.includes(shown.photoId),
      onKept: (kept) => {
        setTransients((list) => list.filter((photo) => photo.id !== kept.id));
        setDeclinedIds((ids) => ids.filter((id) => id !== kept.id));
      },
      onUnkept: (again) => {
        setTransients((list) =>
          list.some((photo) => photo.id === again.id) ? list : [...list, again],
        );
        setDeclinedIds((ids) => (ids.includes(again.id) ? ids : [...ids, again.id]));
      },
      onKeeping: markKeeping,
    };
  }

  const colours = productColours(product);
  // The picker keeps the colour of the result it came back from («Примерить на другом фото»).
  const shownColour = fitting?.items[0]?.attributeValueId;
  const pickerColour = colours.find((colour) => colour.id === shownColour) ?? colours[0];
  const loadedFittings = history.data?.pages.flatMap((page) => page.items) ?? [];

  // The window closes first: two dialogs do not stack (A90.12). A look item's «Заменить» brings its
  // slot into view (spec 0024 Z8).
  function toRoom(slot?: OutfitSlot) {
    onClose();
    openRoom({ slot });
  }

  // «Примерить на другом фото» and the error card's «Другое фото»: the picker with the empty zone
  // and no photo chosen (spec 0024 AC17, Z34), so «Примерить» waits for a choice.
  function pickOtherPhoto() {
    setChosenId(null);
    setPicking(true);
  }

  const pickerProps = {
    photos: photos.data,
    photosFailed: photos.isError,
    transient,
    onTransient: (photo: UserPhoto) => setTransients((list) => [...list, photo]),
    chosenId: chosen,
    onChoose: setChosenId,
    quota: quota.data,
    disabled: starting !== null,
  };

  // A colour clicked over the shown result: its wait over the picture (boards 7.2, 8.2).
  const startingOver = starting?.overResult ? pendingFitting(starting) : null;
  // The click a running fitting started from in this window, its progress's origin (AC19).
  const originOf = (id: string) => (origin?.id === id ? origin.at : undefined);
  const resultStart = { onStart: beginStart, onStartFailed: endStart };

  let content;
  // The wait of its own (board 6), in one place for a start on its way and the fitting it became,
  // so the answer changes its props and nothing restarts (AC19).
  let wait: ReactNode = null;
  // While a start is on its way the picker stays as it was, whatever its reads do meanwhile: a
  // card in its place would unmount the start's button, and the answer would reach nobody.
  if (limited || (picking && starting === null && quota.data?.left === 0)) {
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
      !shownLook && room.isError && starting === null ? (
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
              onStart={() =>
                beginStart({
                  kind: 'look',
                  items: pickerLook?.items ?? [],
                  photoId,
                  overResult: false,
                })
              }
              onStarted={(next) => started(next)}
              onLimit={reachedLimit}
              onError={startFailed(onError)}
            />
          )}
        />
      );
  } else if (picking) {
    content =
      productQuery.isError && starting === null ? (
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
                onStart={() =>
                  beginStart({
                    kind: 'single',
                    items: [
                      {
                        productId: product.id,
                        name: product.name,
                        imageUrl: product.image?.url ?? null,
                        colour: pickerColour?.value ?? null,
                        attributeValueId: pickerColour?.id ?? null,
                      },
                    ],
                    photoId,
                    overResult: false,
                  })
                }
                onStarted={(next) => started(next)}
                onLimit={reachedLimit}
                onError={startFailed(onError)}
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
        running={startingOver}
        photo={resultPhoto(fitting)}
        quota={quota.data}
        {...resultStart}
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
        origin={originOf(fitting.id)}
        photo={resultPhoto(baseQuery.data)}
        quota={quota.data}
        {...resultStart}
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
        origin={originOf(fitting.id)}
        photo={resultPhoto(baseQuery.data)}
        {...resultStart}
        product={product}
        colours={colours}
        tried={triedColours(loadedFittings, baseQuery.data.photoId, productId)}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOtherPhoto={pickOtherPhoto}
        slot={slot}
      />
    );
  } else if (isFittingRunning(fitting)) {
    content = null;
    wait = (
      <FittingWait
        key="wait"
        fitting={fitting}
        origin={originOf(fitting.id)}
        photoUrl={photoUrl(fitting.photoId)}
        onClose={onClose}
      />
    );
  } else if (fitting.status === 'completed') {
    content = (
      <FittingResult
        fitting={fitting}
        running={startingOver}
        photo={resultPhoto(fitting)}
        {...resultStart}
        product={product}
        colours={colours}
        tried={triedColours(loadedFittings, fitting.photoId, productId)}
        quota={quota.data}
        onStarted={startedColour}
        onRegenerated={(next) => started(next)}
        onLimit={reachedLimit}
        onOtherPhoto={pickOtherPhoto}
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
        onOtherPhoto={pickOtherPhoto}
        error={retryError}
      />
    );
  }

  // A start clicked in the picker or «Что поменять?»: the wait at once (spec 0024 AC19), the screen
  // it came from kept mounted and hidden under it, so the answer reaches its button and a refusal
  // brings it back as it was, with its notice.
  const waiting =
    starting && !starting.overResult ? (
      <FittingWait
        key="wait"
        fitting={pendingFitting(starting)}
        photoUrl={photoUrl(starting.photoId)}
        onClose={onClose}
      />
    ) : (
      wait
    );

  // The clicked button is hidden with its screen: the focus goes to the window, as `TryOnModal`
  // does for a removed control, since a hidden one may keep it without a `focusout`.
  const screenRef = useRef<HTMLDivElement>(null);
  const screenHidden = waiting !== null;
  useEffect(() => {
    const screen = screenRef.current;
    if (!screenHidden || !screen?.contains(document.activeElement)) return;
    screen.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
  }, [screenHidden]);

  if (foreign) return null;

  return (
    <TryOnModal title={isLook ? 'Примерка образа' : 'Онлайн-примерка'} onClose={onClose}>
      <div ref={screenRef} hidden={screenHidden}>
        {content}
      </div>
      {waiting}
    </TryOnModal>
  );
}

interface TryOnModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// The window, whose height follows a new screen smoothly (spec 0023 P10). A new screen unmounts the
// control that had the focus (the regeneration's «Что поменять?» as its popover closes, «Попробовать ещё раз»), and the browser drops the focus on the
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
        // window over it (the tips, a nested dialog) or the kit's AnchoredPanel «Что поменять?»,
        // which is no nested dialog to Base UI, holds the focus, which Base UI keeps there.
        const popup = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
        if (!popup || popup.hasAttribute('data-nested-dialog-open')) return;
        if (anchoredPanelOpen()) return;
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
