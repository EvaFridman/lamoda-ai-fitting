'use client';

import { plural } from '@/shared/lib';
import { CountBadge, HangerIcon, IconButton, type IconButtonProps } from '@/shared/ui';

import styles from './fitting-room-button.module.scss';

export interface FittingRoomButtonProps extends Omit<IconButtonProps, 'aria-label' | 'children'> {
  // The items in the room, 0–5; 0 draws no counter (board 13).
  count: number;
}

// «Примерочная, 3 вещи»: the counter is hidden from screen readers, the name says it.
export function fittingRoomLabel(count: number): string {
  if (count <= 0) return 'Примерочная';
  return `Примерочная, ${count} ${plural(count, ['вещь', 'вещи', 'вещей'])}`;
}

// Board 13's FittingRoomButton: the header's hanger with the room's count (spec 0019 A10). Its
// handlers are the placer's: it opens the room, or the sign-in window for a visitor (A12). The
// other props reach the kit's button, so a modal's trigger can render it.
export function FittingRoomButton({ count, className, ...props }: FittingRoomButtonProps) {
  return (
    <IconButton
      {...props}
      aria-label={fittingRoomLabel(count)}
      className={[styles.button, className].filter(Boolean).join(' ')}
    >
      <HangerIcon />
      <CountBadge count={count} className={styles.count} />
    </IconButton>
  );
}
