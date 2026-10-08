'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { Toggle } from '@base-ui/react/toggle';
import { useRef } from 'react';

import { ChevronDownIcon, CloseIcon } from '../icon/icons';

import styles from './filter-chip.module.scss';

export interface FilterChipProps extends Omit<
  Toggle.Props,
  'className' | 'style' | 'render' | 'children' | 'value' | 'nativeButton'
> {
  // The chip's text and the button's accessible name.
  title: string;
  className?: string;
}

// The on/off chip with no chevron ("Только со скидкой"): Base UI's Toggle, a button with
// aria-pressed. Pressed, it turns black with a ×; a press anywhere on it turns it off again.
export function FilterChip({ title, className, ...toggle }: FilterChipProps) {
  return (
    <Toggle
      className={[styles.chip, styles.toggle, className].filter(Boolean).join(' ')}
      {...toggle}
    >
      <span>{title}</span>
      <CloseIcon size={16} className={styles.toggleCross} />
    </Toggle>
  );
}

export interface FilterChipTriggerProps {
  title: string;
  value?: string;
  applied: boolean;
  onClear?: () => void;
  // Ties the trigger to a Popover.Root opened from the start (its `defaultTriggerId`).
  id?: string;
}

// The chip that opens a FilterDropdown, rendered by it inside its Popover.Root; not exported from
// the ui segment. Applied, it is black with the chosen value after the title. Given `onClear`, an
// applied chip ends in a × button of its own next to the trigger (a button cannot hold another).
export function FilterChipTrigger({ title, value, applied, onClear, id }: FilterChipTriggerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const clearable = applied && onClear !== undefined;

  return (
    <span className={[styles.chip, applied && styles.applied].filter(Boolean).join(' ')}>
      <Popover.Trigger
        ref={triggerRef}
        id={id}
        className={[styles.trigger, clearable && styles.withClear].filter(Boolean).join(' ')}
      >
        <span>{title}</span>
        {/* The space keeps the name "Стиль вечерний"; between flex items it takes no room. */}
        {value ? (
          <>
            {' '}
            <span className={styles.value}>{value}</span>
          </>
        ) : null}
        {clearable ? null : <ChevronDownIcon size={16} className={styles.icon} />}
      </Popover.Trigger>
      {clearable ? (
        <BaseButton
          className={styles.clear}
          aria-label={`Сбросить «${title}»`}
          onClick={() => {
            onClear();
            // The × goes away with the applied state: the focus stays on the chip.
            triggerRef.current?.focus();
          }}
        >
          <CloseIcon size={16} />
        </BaseButton>
      ) : null}
    </span>
  );
}
