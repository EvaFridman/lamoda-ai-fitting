import type { ReactNode } from 'react';

import { plural } from '@/shared/lib';

import styles from './limit-meter.module.scss';

// At this many try-ons left or fewer the meter turns to the caution colour (spec 0019 AC19).
export const FEW_TRIES_LEFT = 3;

const TRIES = ['примерка', 'примерки', 'примерок'] as const;

// «Осталось 12 примерок в этом месяце», «Осталось 2 — мало», «Примерки закончились» (board 13).
export function triesLeftText(left: number): string {
  if (left <= 0) return 'Примерки закончились';
  const verb = plural(left, ['Осталась', 'Осталось', 'Осталось']);
  if (left <= FEW_TRIES_LEFT) return `${verb} ${left} — мало`;
  return `${verb} ${left} ${plural(left, TRIES)} в этом месяце`;
}

export interface LimitMeterProps {
  // The try-ons of the month left and the month's limit (`GET /me/fitting-quota`).
  left: number;
  limit: number;
  // The text next to the bar; `triesLeftText(left)` by default.
  children?: ReactNode;
  // `stacked`: board 9's meter under the account's side menu, the text, a longer bar and the
  // caption one under another.
  layout?: 'row' | 'stacked';
  // A grey line under the bar, `stacked` only: «Обновится 1 ноября».
  caption?: ReactNode;
  className?: string;
}

// Board 13's LimitMeter: a short bar of the try-ons left and its text, in the caution colour at
// three or fewer (AC19).
export function LimitMeter({
  left,
  limit,
  children,
  layout = 'row',
  caption,
  className,
}: LimitMeterProps) {
  const share = limit > 0 ? Math.min(1, Math.max(0, left / limit)) : 0;
  const stacked = layout === 'stacked';
  const bar = (
    <span className={styles.bar} aria-hidden>
      <span className={styles.fill} style={{ width: `${share * 100}%` }} />
    </span>
  );
  const text = <span>{children ?? triesLeftText(left)}</span>;
  return (
    <p
      className={[
        styles.meter,
        stacked && styles.stacked,
        left <= FEW_TRIES_LEFT && styles.few,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {stacked ? (
        <>
          {text}
          {bar}
          {caption && <span className={styles.caption}>{caption}</span>}
        </>
      ) : (
        <>
          {bar}
          {text}
        </>
      )}
    </p>
  );
}

// After «из» the noun is genitive: «из 1 примерки», «из 40 примерок».
const OF_TRIES = ['примерки', 'примерок', 'примерок'] as const;

// «Осталось 11 из 40 примерок» (board 9's side menu).
export function triesLeftOfText(left: number, limit: number): string {
  if (left <= 0) return 'Примерки закончились';
  const verb = plural(left, ['Осталась', 'Осталось', 'Осталось']);
  return `${verb} ${left} из ${limit} ${plural(limit, OF_TRIES)}`;
}
