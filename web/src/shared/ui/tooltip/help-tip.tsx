'use client';

import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';

import type { TooltipSide } from './tooltip';
import styles from './tooltip.module.scss';

export interface HelpTipProps {
  // The name of the "?" and of its hint for screen readers ("Как считается цена").
  'aria-label': string;
  side?: TooltipSide;
  // The hint: text or a short paragraph.
  children: ReactNode;
}

// Lamoda's "?" after a label (x-popover-help): a 14px circle that opens a hint with the look of a
// Tooltip. It is a Base UI Popover, so everyone can reach the hint, not only a mouse (D7aa): the
// pointer resting on the "?" opens it after 300ms, a click, a tap, Enter or Space open it and move
// the focus inside, a screen reader reads it, and Esc closes it with the focus back on the "?".
export function HelpTip({ 'aria-label': label, side = 'top', children }: HelpTipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger className={styles.helpTrigger} openOnHover aria-label={label}>
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side={side} sideOffset={10}>
          <Popover.Popup className={`${styles.popup} ${styles.help}`} aria-label={label}>
            {children}
            <Popover.Arrow className={styles.arrow} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
