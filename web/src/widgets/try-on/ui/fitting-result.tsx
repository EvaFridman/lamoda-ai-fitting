'use client';

import { useRef, useState } from 'react';

import {
  type Fitting,
  fittingDate,
  type FittingQuota,
  LimitMeter,
  SavedNote,
  type StartedFitting,
  triesLeftTail,
} from '@/entities/fitting';
import type { OutfitSlot } from '@/entities/category';
import type { ProductDetail } from '@/entities/product';
import { useLookToggle } from '@/features/fitting-room';
import { showStubToast } from '@/features/product-stubs';
import { RegenerateSheet } from '@/features/regenerate-fitting';
import { ColorTryOn, type TryColour } from '@/features/try-colour';
import { useTrackedElement } from '@/shared/analytics';
import { FITTINGS_HREF, PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, CheckIcon, FavoriteToggle, HangerIcon, LinkButton, Select } from '@/shared/ui';

import { ItemRow } from './item-row';
import { ResultPicture, ResultTiles, useRunningProgress } from './result-media';

import styles from './fitting-result.module.scss';

export interface FittingResultProps {
  // The result shown.
  fitting: Fitting;
  // A colour of it running (board 7.2): its progress over the picture, the colours off.
  running: Fitting | null;
  product: ProductDetail | undefined;
  colours: readonly TryColour[];
  tried: ReadonlySet<string>;
  quota: FittingQuota | undefined;
  // Another colour started: it runs over this result (board 7.2).
  onStarted: (fitting: StartedFitting) => void;
  // A regeneration started: it has the wait of its own (board 14: «Что поменять?» → 6).
  onRegenerated: (fitting: StartedFitting) => void;
  onLimit: () => void;
  // «Примерить на другом фото»: back to the picker.
  onOtherPhoto: () => void;
  // The product's slot of the fitting room: `null` none (no tile), `undefined` not known yet.
  slot: OutfitSlot | null | undefined;
}

interface LookTileProps {
  product: ProductDetail;
  slot: OutfitSlot;
  attributeValueId: string | null | undefined;
}

// The tile «К образу» (A90.11): the result's item, in its colour, into the fitting room;
// «В образе» while it is there, and a click takes it out (`result.to-look`, A94.1).
function LookTile({ product, slot, attributeValueId }: LookTileProps) {
  // The try-on is a signed-in user's: no sign-in window here.
  const look = useLookToggle({
    product,
    slot,
    attributeValueId,
    element: 'result.to-look',
    onSignIn: () => undefined,
  });
  return (
    <button
      type="button"
      className={styles.tile}
      aria-pressed={look.pressed}
      // Waits focusable, as the hanger: the focus stays on it through the write.
      aria-disabled={look.busy || undefined}
      onClick={look.toggle}
      {...look.events}
    >
      {look.pressed ? <CheckIcon /> : <HangerIcon />}
      {look.pressed ? 'В образе' : 'К образу'}
    </button>
  );
}

// Board 7, the result of one item (spec 0019 AC5, AC7, AC8, A62): its date, the picture with
// «Сгенерировано ИИ», «Сохранено в «Мои примерки»» (spec 0023 Y7) and the caption under it, the tiles (the share disabled, A14; «К образу» into the fitting
// room, A90.11), the item with the size select and the cart's and favourites' stubs (A33), the product's
// other colours (A74, A76), «Хотите что-то поменять в образе?» with the sheet «Что поменять?»,
// «Примерить на другом фото» and the month's meter. The picture is only an image's `src`, in an
// `mp-block` container (A37).
export function FittingResult({
  fitting,
  running,
  product,
  colours,
  tried,
  quota,
  onStarted,
  onRegenerated,
  onLimit,
  onOtherPhoto,
  slot,
}: FittingResultProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const pictureRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const regenerateElement = useTrackedElement('result.regenerate-open');
  const cartElement = useTrackedElement('result.add-to-cart', { kind: 'single' });
  const otherPhotoElement = useTrackedElement('result.other-photo');
  const historyElement = useTrackedElement('result.history');
  const item = fitting.items[0];
  const progress = useRunningProgress(running);
  const sizes = product?.variations.map(({ size: value }) => ({ value, label: value })) ?? [];

  const picture = (
    <ResultPicture
      fitting={fitting}
      running={running}
      progress={progress}
      runningLabel={`Примеряем ${running?.items[0]?.colour ?? 'другой цвет'}…`}
      alt={item ? `Сгенерированное изображение: вы в вещи «${item.name}»` : 'Результат примерки'}
      pictureRef={pictureRef}
    />
  );

  const tiles = (
    <ResultTiles fitting={fitting} running={running} pictureRef={pictureRef} phone={phone}>
      {product && slot ? (
        <LookTile product={product} slot={slot} attributeValueId={item?.attributeValueId} />
      ) : (
        // A product of no slot has none (AC16), nor one whose reads failed; one that loads waits.
        slot !== null && (
          <button type="button" className={styles.tile} disabled>
            <HangerIcon />К образу
          </button>
        )
      )}
    </ResultTiles>
  );

  const cart = (
    <Button
      size={phone ? 48 : 56}
      className={styles.cart}
      onClick={() => {
        cartElement.onClick();
        showStubToast();
      }}
      onPointerEnter={cartElement.onPointerEnter}
      onPointerLeave={cartElement.onPointerLeave}
    >
      {phone ? 'В корзину' : 'Добавить в корзину'}
    </Button>
  );
  // The favourite's stub never stays pressed (A33).
  const favourite = (
    <FavoriteToggle
      size={phone ? 48 : 56}
      pressed={false}
      onPressedChange={showStubToast}
      aria-label="В избранное"
    />
  );

  return (
    <div className={styles.result}>
      {fitting.finishedAt && <p className={styles.saved}>{fittingDate(fitting.finishedAt)}</p>}

      <div className={styles.left}>
        {picture}
        <SavedNote href={FITTINGS_HREF} events={historyElement} />
        {running ? (
          <p className={styles.muted}>
            {item?.colour
              ? `${item.colour.charAt(0).toUpperCase()}${item.colour.slice(1)} вариант сохранён в истории`
              : 'Результат сохранён в истории'}
          </p>
        ) : (
          <p className={styles.note}>
            Изображение приблизительное, могут быть неточности в посадке, длине и цвете.
          </p>
        )}
        {tiles}
      </div>

      <div className={styles.right}>
        {item && (
          <div className={styles.item}>
            <ItemRow
              size="l"
              name={item.name}
              imageUrl={item.imageUrl}
              details={item.colour}
              price={item.price}
              finalPrice={item.finalPrice}
            />
            {sizes.length > 0 && (
              <Select
                options={sizes}
                value={size}
                onValueChange={(value) => setSize(value)}
                placeholder="Выберите размер"
                aria-label="Размер"
              />
            )}
            <div className={styles.buy}>
              {cart}
              {favourite}
            </div>
          </div>
        )}

        <ColorTryOn
          fitting={fitting}
          colours={colours}
          tried={tried}
          generating={running?.items[0]?.attributeValueId ?? null}
          onStarted={(started) => onStarted(started)}
          onLimit={onLimit}
        />

        <div className={styles.footer}>
          <Button
            variant="secondary"
            fullWidth
            disabled={running !== null || fitting.photoId === null}
            onClick={() => {
              regenerateElement.onClick();
              setRegenerating(true);
            }}
            onPointerEnter={regenerateElement.onPointerEnter}
            onPointerLeave={regenerateElement.onPointerLeave}
          >
            Хотите что-то поменять в образе?
          </Button>
          <div className={styles.footerRow}>
            <LinkButton
              // A colour that runs is shown here: its end would show nowhere from the picker.
              disabled={running !== null}
              onClick={() => {
                otherPhotoElement.onClick();
                onOtherPhoto();
              }}
              onPointerEnter={otherPhotoElement.onPointerEnter}
              onPointerLeave={otherPhotoElement.onPointerLeave}
            >
              Примерить на другом фото
            </LinkButton>
            {quota && (
              <LimitMeter left={quota.left} limit={quota.limit}>
                {running?.countsAgainstLimit
                  ? `Списали 1 примерку · ${triesLeftTail(quota.left)}`
                  : undefined}
              </LimitMeter>
            )}
          </div>
        </div>
      </div>

      <RegenerateSheet
        fitting={fitting}
        open={regenerating}
        onOpenChange={setRegenerating}
        onStarted={(started) => {
          setRegenerating(false);
          onRegenerated(started);
        }}
        onLimit={() => {
          setRegenerating(false);
          onLimit();
        }}
      />
    </div>
  );
}
