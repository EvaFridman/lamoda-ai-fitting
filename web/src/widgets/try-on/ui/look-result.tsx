'use client';

import { useRef, useState } from 'react';

import {
  type Fitting,
  fittingDate,
  type FittingItem,
  type FittingQuota,
  fittingErrorText,
  fittingRefusal,
  itemWord,
  LimitMeter,
  SavedNote,
  type StartedFitting,
  timeLeftText,
  triesLeftTail,
  useStartLookFitting,
} from '@/entities/fitting';
import { bySlot, type OutfitSlot, useFittingRoom } from '@/entities/fitting-room';
import { useAnyColourChoice } from '@/entities/product';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { RegeneratePopover } from '@/features/regenerate-fitting';
import type { PendingFitting } from '@/features/start-fitting';
import { SavePhotoSwitch } from '@/features/upload-photo';
import { useTrackedElement } from '@/shared/analytics';
import { FITTINGS_HREF } from '@/shared/config';
import { formatPrice } from '@/shared/lib';
import { Button, Notice, ProgressBar } from '@/shared/ui';

import { RESULT_NOTE } from '../lib/result-note';
import type { ResultPhotoProps } from '../model/result-photo';
import type { StartIntent } from '../model/starting';
import { itemsText } from './look-subject';
import { LookItemRow } from './look-item-row';
import { ResultPicture, useRunningProgress } from './result-media';

import styles from './look-result.module.scss';

// A look's items in the slots' order (board 8: top, bottom, outerwear, shoes, accessory).
export function itemsBySlot(items: readonly FittingItem[]): FittingItem[] {
  return bySlot(items);
}

// The item whose colour a regeneration over the result changes: «рубашка Annen, красный».
export function changedItemText(result: Fitting, running: PendingFitting): string | null {
  const changed = running.items.find(
    (item) =>
      result.items.find((before) => before.productId === item.productId)?.attributeValueId !==
      item.attributeValueId,
  );
  if (!changed) return null;
  return changed.colour ? `${itemWord(changed.name)}, ${changed.colour}` : itemWord(changed.name);
}

export interface LookResultProps {
  // The result shown.
  fitting: Fitting;
  // The look regenerating over it with one colour changed (board 8.2), or its start on its way.
  running: PendingFitting | null;
  // The click that started `running` in this window: its progress goes on from there (AC19).
  origin?: number;
  quota: FittingQuota | undefined;
  // A colour or a regeneration clicked, before the api answers (spec 0024 AC19).
  onStart: (intent: StartIntent) => void;
  // That start failed (not at the limit): its wait goes, and this screen says why.
  onStartFailed: () => void;
  // A colour change started: it runs over this result.
  onStarted: (fitting: StartedFitting) => void;
  // A regeneration of «Что поменять?» started: it has the wait of its own.
  onRegenerated: (fitting: StartedFitting) => void;
  onLimit: () => void;
  // An item's «Заменить»: the window closes and the room opens at that slot (spec 0024 Z8).
  onOpenRoom: (slot?: OutfitSlot) => void;
  // The save switch's part of the window (spec 0024 AC22).
  photo: ResultPhotoProps;
}

// Board 8, the result of a look (spec 0019 AC14, AC15, A62, A92), one markup on every width (spec
// 0024 AC12): «N вещи · <date>», the picture with «Сохранено в «Мои примерки»» and its «!» (spec
// 0023 Y7, spec 0024 AC13), its full screen, «Скачать» and «Поделиться» over it (AC23), the save switch of a one-time photo (AC22), «Вещи образа» (each item with its price, colours and
// «Заменить»; another colour regenerates the whole look on the same photo), then a block at the
// column's bottom, level with the picture's on a wide window (AC14): the sum, the stub «Добавить
// образ в корзину» with the heart (A33, spec 0023 P31, P32), «Хотите что-то поменять в образе?»
// with «Какая именно?» and the meter. Below 800px one column.
export function LookResult({
  fitting,
  running,
  origin,
  quota,
  onStart,
  onStartFailed,
  onStarted,
  onRegenerated,
  onLimit,
  onOpenRoom,
  photo,
}: LookResultProps) {
  const [regenerating, setRegenerating] = useState(false);
  const regenerateRef = useRef<HTMLButtonElement>(null);
  const start = useStartLookFitting();
  const regenerateElement = useTrackedElement('result.regenerate-open');
  const historyElement = useTrackedElement('result.history');
  const room = useFittingRoom();
  const roomElement = useTrackedElement('room.open', {
    source: 'result',
    items: room.data?.count ?? 0,
  });
  const progress = useRunningProgress(running, origin);
  const items = itemsBySlot(fitting.items);
  // The line «Смена цвета…» shows only while some item has another colour (spec 0024 AC12).
  const anyColourChoice = useAnyColourChoice(items.map((item) => item.productId));
  const cartElement = useTrackedElement('result.add-to-cart-all', { items: items.length });
  const sum = items.reduce((total, item) => total + item.finalPrice, 0);
  const busy = running !== null || start.isPending;
  // The limit opens its card; anything else, the wishes refused on this start too, is said here.
  const failure =
    start.isError && fittingRefusal(start.error) !== 'limit_reached'
      ? fittingErrorText(start.error)
      : null;
  const changed = running ? changedItemText(fitting, running) : null;

  function changeColour(productId: string, attributeValueId: string, colour: string | null) {
    if (busy || fitting.photoId === null) return;
    onStart({
      kind: 'look',
      items: fitting.items.map((item) =>
        item.productId === productId ? { ...item, attributeValueId, colour } : item,
      ),
      photoId: fitting.photoId,
      overResult: true,
    });
    start.mutate(
      {
        photoId: fitting.photoId,
        items: fitting.items.map((item) => ({
          productId: item.productId,
          attributeValueId: item.productId === productId ? attributeValueId : item.attributeValueId,
        })),
        promptText: fitting.promptText,
        source: 'colour',
      },
      {
        onSuccess: (started) => onStarted(started),
        onError: (error) => {
          if (fittingRefusal(error) === 'limit_reached') onLimit();
          else onStartFailed();
        },
      },
    );
  }

  return (
    <div className={styles.result}>
      <p className={styles.saved}>
        {itemsText(items.length)}
        {fitting.finishedAt && ` · ${fittingDate(fitting.finishedAt)}`}
      </p>

      <div className={styles.left}>
        <ResultPicture
          fitting={fitting}
          running={running}
          progress={progress}
          alt="Сгенерированное изображение: вы в образе"
        />
        <SavedNote href={FITTINGS_HREF} events={historyElement} note={RESULT_NOTE} />
      </div>

      <div className={styles.right}>
        <SavePhotoSwitch
          photoId={fitting.photoId}
          photoTransient={fitting.photoTransient}
          {...photo}
        />
        <h3 className={styles.title}>Вещи образа</h3>
        {anyColourChoice && (
          <p className={styles.muted}>
            Смена цвета одной вещи перегенерирует весь образ на этом же фото
          </p>
        )}
        {running && progress && (
          <div className={styles.running} aria-live="polite">
            <span>Перегенерируем образ{changed ? `: ${changed}` : ''}</span>
            <ProgressBar value={progress.percent} aria-label="Прогресс примерки" />
            <span className={styles.muted}>
              {timeLeftText(progress.secondsLeft)}
              {running.countsAgainstLimit && ' · 1 примерка'}
            </span>
          </div>
        )}
        {failure && (
          <Notice tone="error" role="alert">
            {failure}
          </Notice>
        )}
        <ul className={styles.items}>
          {items.map((item) => (
            <li key={item.productId}>
              <LookItemRow
                item={item}
                // A photo gone takes the colours with it: the look cannot run again.
                disabled={busy || fitting.photoId === null}
                onColour={(id, colour) => changeColour(item.productId, id, colour)}
                replaceEvents={{
                  onPointerEnter: roomElement.onPointerEnter,
                  onPointerLeave: roomElement.onPointerLeave,
                }}
                onReplace={() => {
                  roomElement.onClick();
                  onOpenRoom(item.slot ?? undefined);
                }}
              />
            </li>
          ))}
        </ul>

        <div className={styles.bottom}>
          <p className={styles.sum}>
            <span>Сумма образа</span>
            <b>{formatPrice(sum)}</b>
          </p>
          <div className={styles.buttons}>
            <CartStubButton size={56} className={styles.grow} events={cartElement}>
              Добавить образ в корзину
            </CartStubButton>
            <FavoriteStub
              size={56}
              aria-label="Добавить образ в избранное"
              tooltip="Добавим в избранное все вещи образа"
            />
          </div>
          <Button
            ref={regenerateRef}
            variant="secondary"
            fullWidth
            disabled={busy || fitting.photoId === null}
            onClick={() => {
              regenerateElement.onClick();
              setRegenerating(true);
            }}
            onPointerEnter={regenerateElement.onPointerEnter}
            onPointerLeave={regenerateElement.onPointerLeave}
          >
            Хотите что-то поменять в образе?
          </Button>
          {quota && (
            <LimitMeter left={quota.left} limit={quota.limit}>
              Образ — 1 примерка · {triesLeftTail(quota.left)}
            </LimitMeter>
          )}
        </div>
      </div>

      <RegeneratePopover
        fitting={fitting}
        anchor={regenerateRef}
        open={regenerating}
        onOpenChange={setRegenerating}
        onStart={() => {
          setRegenerating(false);
          onStart({
            kind: fitting.kind,
            items: fitting.items,
            photoId: fitting.photoId,
            overResult: false,
          });
        }}
        onStarted={(started) => {
          setRegenerating(false);
          onRegenerated(started);
        }}
        onLimit={() => {
          setRegenerating(false);
          onLimit();
        }}
        onFailed={() => {
          onStartFailed();
          setRegenerating(true);
        }}
      />
    </div>
  );
}
