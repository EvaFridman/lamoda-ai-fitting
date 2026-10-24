'use client';

import { useId } from 'react';

import {
  type Fitting,
  fittingRefusal,
  type StartedFitting,
  useStartSingleFitting,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { CheckIcon, type HexColor, Notice, Spinner, SwatchDot } from '@/shared/ui';

import styles from './color-try-on.module.scss';

export interface TryColour {
  // The attribute value's id, its name and its swatch colour.
  id: string;
  value: string;
  colorHex: string | null;
}

export interface ColorTryOnProps {
  // The result shown: its photo, its product and its colour.
  fitting: Fitting;
  // The product's colours (A76): the block shows from two.
  colours: readonly TryColour[];
  // The colours already tried on this photo: they open at once, for free (A7).
  tried: ReadonlySet<string>;
  // The colour a fitting runs for (board 7.2); the others are off meanwhile.
  generating?: string | null;
  onStarted: (fitting: StartedFitting, colour: TryColour) => void;
  onLimit: () => void;
}

function ColourTile({
  colour,
  current,
  tried,
  generating,
  disabled,
  onClick,
}: {
  colour: TryColour;
  current: boolean;
  tried: boolean;
  generating: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tracked = useTrackedElement('result.try-colour', { tried });
  return (
    <button
      type="button"
      className={styles.tile}
      aria-pressed={current}
      aria-busy={generating || undefined}
      disabled={disabled}
      onClick={() => {
        tracked.onClick();
        onClick();
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <span className={styles.swatch}>
        <SwatchDot
          color={colour.colorHex === null ? undefined : (colour.colorHex as HexColor)}
          className={styles.dot}
        />
        {generating && (
          <span className={styles.spin}>
            <Spinner size={24} />
          </span>
        )}
        {tried && !current && !generating && (
          <span className={styles.tried}>
            <CheckIcon size={16} title="Уже примерено" />
          </span>
        )}
      </span>
      <span className={styles.name}>{colour.value}</span>
    </button>
  );
}

// Board 7's ColorTryOn as A74 draws it: the product's colours as circles with their names; a tap
// tries that colour on the same photo (spec 0019 AC7: one try-on, or a tried one opens at once and
// spends nothing). The current colour is outlined, a tried one carries a tick, and while one
// generates the others are off.
export function ColorTryOn({
  fitting,
  colours,
  tried,
  generating = null,
  onStarted,
  onLimit,
}: ColorTryOnProps) {
  const start = useStartSingleFitting();
  const titleId = useId();
  const item = fitting.items[0];
  if (!item || fitting.photoId === null || colours.length < 2) return null;
  const photoId = fitting.photoId;
  const busy = start.isPending || generating !== null;
  const failure =
    start.isError && fittingRefusal(start.error) === null ? errorText(start.error) : null;

  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 id={titleId} className={styles.title}>
          Примерить другой цвет
        </h3>
        <span className={styles.hint}>в один клик, на этом же фото</span>
      </div>
      <div className={styles.tiles} role="group" aria-label="Цвета">
        {colours.map((colour) => {
          const current = colour.id === item.attributeValueId;
          const pending =
            generating === colour.id ||
            (start.isPending && start.variables.attributeValueId === colour.id);
          return (
            <ColourTile
              key={colour.id}
              colour={colour}
              current={current && generating === null}
              tried={tried.has(colour.id)}
              generating={pending}
              disabled={current || (busy && !pending)}
              onClick={() => {
                if (busy) return;
                start.mutate(
                  {
                    photoId,
                    productId: item.productId,
                    attributeValueId: colour.id,
                    source: 'colour',
                  },
                  {
                    onSuccess: (started) => onStarted(started, colour),
                    onError: (error) => {
                      if (fittingRefusal(error) === 'limit_reached') onLimit();
                    },
                  },
                );
              }}
            />
          );
        })}
      </div>
      <p className={styles.caption}>
        {busy
          ? 'Пока идёт примерка, другие цвета недоступны'
          : 'Новый цвет — 1 примерка. Цвета с галочкой уже примерены: откроются сразу и бесплатно.'}
      </p>
      {failure && (
        <Notice tone="error" role="alert">
          {failure}
        </Notice>
      )}
    </section>
  );
}
