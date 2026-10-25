'use client';

import type { ButtonHTMLAttributes } from 'react';

import { HangerIcon, Tooltip } from '@/shared/ui';

import styles from './look-toggle.module.scss';

export interface LookToggleProps {
  // The product is in the fitting room: the hanger is black.
  pressed?: boolean;
  // While the session or the room loads, or a click's write runs: dimmed and no click, but
  // focusable (`aria-disabled`), and the same button inside its tooltip, so a keyboard user keeps
  // the focus through the write.
  busy?: boolean;
  // Off for good: dimmed, no tooltip.
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  // The placer's hover handlers (its tracked element).
  events?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerEnter' | 'onPointerLeave'>;
  className?: string;
}

// Board 13's LookToggle: the hanger in a card photo's top left corner, the heart's pair (A63.1). Grey,
// black on hover and when pressed, its tooltip its name («Добавить к образу», A62); disabled, none.
export function LookToggle({
  pressed = false,
  busy = false,
  disabled = false,
  onPressedChange,
  events,
  className,
}: LookToggleProps) {
  const label = pressed ? 'В примерочной — убрать' : 'Добавить к образу';
  const button = (
    <button
      {...events}
      type="button"
      className={[styles.toggle, className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={busy || undefined}
      disabled={disabled}
      onClick={() => {
        if (!busy) onPressedChange?.(!pressed);
      }}
    >
      <HangerIcon />
    </button>
  );
  if (disabled) return button;
  return (
    <Tooltip content={label} side="bottom">
      {button}
    </Tooltip>
  );
}
