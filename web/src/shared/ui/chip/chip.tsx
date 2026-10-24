'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './chip.module.scss';

// A chip's own click and pointer handlers (the analytics' tracked element), beside the kit's.
export type ChipEvents = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface ChipProps {
  // The value its group holds while it is pressed.
  value: string;
  // The chip's text and the button's accessible name: «Лицо», «Вещь».
  children: ReactNode;
  disabled?: boolean;
  events?: ChipEvents;
}

// One choice of a ChipGroup (board 7's reasons «Что поменять?»): Base UI's Toggle, a button with
// aria-pressed. Pressed, it turns black with white text.
export function Chip({ value, children, disabled, events }: ChipProps) {
  return (
    <Toggle value={value} disabled={disabled} className={styles.chip} {...events}>
      {children}
    </Toggle>
  );
}

export interface ChipGroupProps<Value extends string> {
  // The pressed chips' values.
  value: readonly Value[];
  onValueChange: (value: Value[]) => void;
  // `false`: pressing a chip releases the other one (one choice); a pressed one releases on a
  // second press either way.
  multiple?: boolean;
  disabled?: boolean;
  // The group's name for a screen reader: the question the chips answer.
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  children: ReactNode;
}

// A row of Chips that wraps (Base UI's ToggleGroup: role="group", one Tab stop, the arrow keys
// move between the chips).
export function ChipGroup<Value extends string>({
  value,
  onValueChange,
  multiple = true,
  disabled,
  className,
  children,
  ...aria
}: ChipGroupProps<Value>) {
  return (
    <ToggleGroup<Value>
      value={value}
      onValueChange={(next) => onValueChange(next)}
      multiple={multiple}
      disabled={disabled}
      className={[styles.group, className].filter(Boolean).join(' ')}
      {...aria}
    >
      {children}
    </ToggleGroup>
  );
}
