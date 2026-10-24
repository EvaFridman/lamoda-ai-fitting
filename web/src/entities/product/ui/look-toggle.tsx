'use client';

import { HangerIcon, Tooltip } from '@/shared/ui';

import styles from './look-toggle.module.scss';

export interface LookToggleProps {
  // The product is in the fitting room: the hanger is black.
  pressed?: boolean;
  // Until the fitting room exists (T26) the hanger is shown and sends nothing (A83.6).
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  className?: string;
}

// Board 13's LookToggle: the hanger in a card photo's top left corner, the heart's pair (A63.1). Grey,
// black on hover and when pressed, its tooltip its name («Добавить к образу», A62); disabled, none.
export function LookToggle({
  pressed = false,
  disabled = false,
  onPressedChange,
  className,
}: LookToggleProps) {
  const label = pressed ? 'В примерочной — убрать' : 'Добавить к образу';
  const button = (
    <button
      type="button"
      className={[styles.toggle, className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange?.(!pressed)}
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
