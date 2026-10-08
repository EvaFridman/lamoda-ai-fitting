'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement } from 'react';

import styles from './tooltip.module.scss';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  // The text of the hint. Screen readers do not hear it: the trigger carries the same words as its
  // own name (IconButton's `aria-label`).
  content: string;
  side?: TooltipSide;
  // The control the hint is about: an IconButton or another element that takes a ref and props.
  children: ReactElement;
}

// A short label for a control, shown to sighted mouse and keyboard users (Base UI Tooltip): it
// opens 600ms after the pointer rests on the control or at once when the control gets the focus,
// and Esc closes it. Touch screens never show it. A hint that carries information of its own is a
// HelpTip (D7aa).
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className={styles.positioner} side={side} sideOffset={10}>
          <BaseTooltip.Popup className={`${styles.popup} ${styles.label}`}>
            {content}
            <BaseTooltip.Arrow className={styles.arrow} />
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
