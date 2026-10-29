'use client';

import { useRef, useState } from 'react';

import {
  type Fitting,
  fittingDate,
  type FittingItem,
  type FittingQuota,
  fittingErrorText,
  fittingRefusal,
  ItemsStrip,
  itemWord,
  LimitMeter,
  SavedNote,
  type StartedFitting,
  timeLeftText,
  triesLeftTail,
  useStartLookFitting,
} from '@/entities/fitting';
import { bySlot, useFittingRoom } from '@/entities/fitting-room';
import { CartStubButton, FavoriteStub, showStubToast } from '@/features/product-stubs';
import { RegenerateSheet } from '@/features/regenerate-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { FITTINGS_HREF, PHONE_QUERY } from '@/shared/config';
import { formatPrice, useMediaQuery } from '@/shared/lib';
import { Button, Drawer, HeartIcon, LinkButton, Notice, ProgressBar } from '@/shared/ui';

import { RESULT_NOTE } from '../lib/result-note';
import { itemsText } from './look-subject';
import { LookItemRow } from './look-item-row';
import { ResultPicture, ResultTiles, useRunningProgress } from './result-media';

import styles from './look-result.module.scss';

// A look's items in the slots' order (board 8: top, bottom, outerwear, shoes, accessory).
export function itemsBySlot(items: readonly FittingItem[]): FittingItem[] {
  return bySlot(items);
}

// The item whose colour a regeneration over the result changes: «рубашка Annen, красный».
export function changedItemText(result: Fitting, running: Fitting): string | null {
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
  // The look regenerating over it with one colour changed (board 8.2).
  running: Fitting | null;
  quota: FittingQuota | undefined;
  // A colour change started: it runs over this result.
  onStarted: (fitting: StartedFitting) => void;
  // A regeneration of «Что поменять?» started: it has the wait of its own.
  onRegenerated: (fitting: StartedFitting) => void;
  onLimit: () => void;
  // «Заменить вещь в примерочной»: the window closes and the room opens.
  onOpenRoom: () => void;
}

// Board 8, the result of a look (spec 0019 AC14, AC15, A62, A92): «N вещи · <date>», the picture
// with «Сгенерировано ИИ» and «Сохранено в «Мои примерки»» (spec 0023 Y7), three tiles, «Вещи
// образа» (each item with its price and colours; another colour regenerates the whole look on the
// same photo), the sum, the stubs «Добавить образ в корзину» and «Добавить образ в избранное» (A33,
// spec 0023 P31, P32),
// «Хотите что-то поменять в образе?» with «Какая именно?», «Заменить вещь в примерочной» and the
// meter. On a phone (8.1) the strip and the sum under the picture, and «Вещи образа» a screen of its
// own (8.2).
export function LookResult({
  fitting,
  running,
  quota,
  onStarted,
  onRegenerated,
  onLimit,
  onOpenRoom,
}: LookResultProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const pictureRef = useRef<HTMLDivElement>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const start = useStartLookFitting();
  const regenerateElement = useTrackedElement('result.regenerate-open');
  const historyElement = useTrackedElement('result.history');
  const room = useFittingRoom();
  const roomElement = useTrackedElement('room.open', {
    source: 'result',
    items: room.data?.count ?? 0,
  });
  const progress = useRunningProgress(running);
  const items = itemsBySlot(fitting.items);
  const cartElement = useTrackedElement('result.add-to-cart-all', { items: items.length });
  const sum = items.reduce((total, item) => total + item.finalPrice, 0);
  const busy = running !== null || start.isPending;
  // The limit opens its card; anything else, the wishes refused on this start too, is said here.
  const failure =
    start.isError && fittingRefusal(start.error) !== 'limit_reached'
      ? fittingErrorText(start.error)
      : null;
  const changed = running ? changedItemText(fitting, running) : null;

  function changeColour(productId: string, attributeValueId: string) {
    if (busy || fitting.photoId === null) return;
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
        },
      },
    );
  }

  const runningNote = running && progress && (
    <div className={styles.running} aria-live="polite">
      <span>Перегенерируем образ{changed ? `: ${changed}` : ''}</span>
      <ProgressBar value={progress.percent} aria-label="Прогресс примерки" />
      <span className={styles.muted}>
        {timeLeftText(progress.secondsLeft)}
        {running.countsAgainstLimit && ' · 1 примерка'}
      </span>
    </div>
  );

  const list = (
    <>
      {runningNote}
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
              onColour={(id) => changeColour(item.productId, id)}
            />
          </li>
        ))}
      </ul>
      <p className={styles.sum}>
        <span>Сумма образа</span>
        <b>{formatPrice(sum)}</b>
      </p>
    </>
  );

  const regenerate = (
    <Button
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
  );
  const replace = (
    <LinkButton
      className={styles.replace}
      onPointerEnter={roomElement.onPointerEnter}
      onPointerLeave={roomElement.onPointerLeave}
      onClick={() => {
        roomElement.onClick();
        onOpenRoom();
      }}
    >
      Заменить вещь в примерочной
    </LinkButton>
  );
  const meter = quota && (
    <LimitMeter left={quota.left} limit={quota.limit}>
      Образ — 1 примерка · {triesLeftTail(quota.left)}
    </LimitMeter>
  );

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
          pictureRef={pictureRef}
        />
        <SavedNote href={FITTINGS_HREF} events={historyElement} note={RESULT_NOTE} />
        <ResultTiles fitting={fitting} running={running} pictureRef={pictureRef} phone={phone} />
      </div>

      {phone ? (
        <div className={styles.right}>
          {runningNote}
          <div className={styles.summary}>
            <ItemsStrip items={items} />
            <span className={styles.summaryText}>
              <span className={styles.muted}>{itemsText(items.length)}</span>
              <b>{formatPrice(sum)}</b>
            </span>
          </div>
          <div className={styles.buttons}>
            <CartStubButton size={48} className={styles.full} events={cartElement}>
              Добавить образ в корзину
            </CartStubButton>
            <Button
              size={48}
              variant="outline"
              className={styles.grow}
              onClick={() => setItemsOpen(true)}
            >
              Вещи образа
            </Button>
            <FavoriteStub size={48} aria-label="Добавить образ в избранное" />
          </div>
          <Drawer
            title="Вещи образа"
            description="Смена цвета одной вещи перегенерирует весь образ на этом же фото"
            side="bottom"
            fullHeight
            open={itemsOpen}
            onOpenChange={(next) => setItemsOpen(next)}
            onBack={() => setItemsOpen(false)}
            backLabel="К результату"
            closable={false}
            footer={
              <div className={styles.footer}>
                <div className={styles.buttons}>
                  <CartStubButton size={48} className={styles.grow} events={cartElement}>
                    Добавить образ в корзину
                  </CartStubButton>
                  <FavoriteStub size={48} aria-label="Добавить образ в избранное" />
                </div>
                {regenerate}
                {replace}
              </div>
            }
          >
            {list}
          </Drawer>
        </div>
      ) : (
        <div className={styles.right}>
          <h3 className={styles.title}>Вещи образа</h3>
          <p className={styles.muted}>
            Смена цвета одной вещи перегенерирует весь образ на этом же фото
          </p>
          {list}
          <div className={styles.buttons}>
            <CartStubButton size={56} className={styles.wide} events={cartElement}>
              Добавить образ в корзину
            </CartStubButton>
            <Button size={56} variant="outline" className={styles.wide} onClick={showStubToast}>
              <HeartIcon />
              Добавить образ в избранное
            </Button>
          </div>
          {regenerate}
          {replace}
          {meter}
        </div>
      )}

      <RegenerateSheet
        fitting={fitting}
        open={regenerating}
        onOpenChange={setRegenerating}
        onStarted={(started) => {
          setRegenerating(false);
          setItemsOpen(false);
          onRegenerated(started);
        }}
        onLimit={() => {
          setRegenerating(false);
          setItemsOpen(false);
          onLimit();
        }}
      />
    </div>
  );
}
