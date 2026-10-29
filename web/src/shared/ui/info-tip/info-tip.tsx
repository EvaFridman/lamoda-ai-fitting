'use client';

import { Popover } from '@base-ui/react/popover';
import { Tooltip } from '@base-ui/react/tooltip';

import { COARSE_POINTER_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';

import { InfoIcon } from '../icon/icons';
import type { TooltipSide } from '../tooltip/tooltip';
import tipStyles from '../tooltip/tooltip.module.scss';
import styles from './info-tip.module.scss';

// The pointer's rest before the hint opens, shorter than Base UI's default (spec 0024 Z39).
const OPEN_DELAY_MS = 100;

export interface InfoTipProps {
  // The name of the «!» for screen readers ("Об изображении").
  'aria-label': string;
  // The hint, a short line.
  content: string;
  side?: TooltipSide;
  className?: string;
}

// A 16px «!» after a line whose hint adds a remark of its own (spec 0024 plan §2.9). With a mouse it
// is the kit's Tooltip: the pointer resting on it or the focus opens it, Esc closes it. Base UI's
// Tooltip never opens by touch, so under a finger (COARSE_POINTER_QUERY, spec 0023 Y13) it is a
// Popover of the same look that a tap opens and a tap outside or Esc closes.
export function InfoTip({ 'aria-label': label, content, side = 'top', className }: InfoTipProps) {
  const finger = useMediaQuery(COARSE_POINTER_QUERY);
  const triggerClass = [styles.trigger, className].filter(Boolean).join(' ');
  const icon = <InfoIcon size={16} className={styles.icon} />;
  const popupClass = `${tipStyles.popup} ${tipStyles.label}`;

  if (finger) {
    return (
      <Popover.Root>
        <Popover.Trigger className={triggerClass} aria-label={label}>
          {icon}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={tipStyles.positioner} side={side} sideOffset={10}>
            <Popover.Popup className={popupClass} aria-label={label}>
              {content}
              <Popover.Arrow className={tipStyles.arrow} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // A Tooltip is for the eyes only; the hint is all the «!» says, so the button carries it as its
  // description too (an attribute, not hidden text: the line around it keeps its own text, and
  // `content` is the page's constant, never user data).
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={OPEN_DELAY_MS}
        render={
          // `aria-description` is ARIA 1.3's, read by Chrome, Safari and Firefox; the plugin's
          // table predates it.
          // eslint-disable-next-line jsx-a11y-x/role-supports-aria-props
          <button
            type="button"
            className={triggerClass}
            aria-label={label}
            aria-description={content}
          />
        }
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className={tipStyles.positioner} side={side} sideOffset={10}>
          <Tooltip.Popup className={popupClass}>
            {content}
            <Tooltip.Arrow className={tipStyles.arrow} />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
