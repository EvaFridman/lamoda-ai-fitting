'use client';

import { Toggle } from '@base-ui/react/toggle';
import { useState } from 'react';

import { HeartFilledIcon } from '../icon/icons';

import styles from './favorite-toggle.module.scss';

export type FavoriteToggleSize = 24 | 32 | 48 | 56;

export interface FavoriteToggleProps extends Pick<
  Toggle.Props,
  'pressed' | 'defaultPressed' | 'onPressedChange' | 'disabled'
> {
  // 24: the bare heart. 32: on a product photo, white with a grey outline. 48 and 56: a square
  // with a border, next to "Добавить в корзину".
  size?: FavoriteToggleSize;
  // The name stays the same whether pressed or not; `aria-pressed` tells the state (D7t).
  'aria-label'?: string;
  className?: string;
}

// Lamoda's favourite button: Base UI's Toggle, a button with aria-pressed. The heart is hollow and
// turns black filled when pressed, beating once (0.6s) as it does.
export function FavoriteToggle({
  size = 24,
  'aria-label': ariaLabel = 'В избранное',
  className,
  onPressedChange,
  ...toggle
}: FavoriteToggleProps) {
  // Set by a press only, so a heart pressed from the start does not beat as the page loads.
  const [beating, setBeating] = useState(false);

  return (
    <Toggle
      className={[styles.toggle, styles[`size${size}`], className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      data-beating={beating || undefined}
      onPressedChange={(pressed, eventDetails) => {
        setBeating(pressed);
        onPressedChange?.(pressed, eventDetails);
      }}
      onAnimationEnd={() => setBeating(false)}
      {...toggle}
    >
      <HeartFilledIcon className={styles.heart} />
    </Toggle>
  );
}
