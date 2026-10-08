'use client';

import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import type { ReactNode } from 'react';

import { ChevronDownIcon } from '../icon/icons';

import styles from './accordion.module.scss';

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  // Several items open at once; one at a time by default.
  multiple?: boolean;
  // The items open from the start (uncontrolled) or now (controlled).
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  className?: string;
}

// Rows with a title and a chevron that turns over when open, a thin line under each, and the
// panel opening by its height (D7y). Base UI's Accordion: each title is an h3 holding a button
// with aria-expanded; Enter or Space opens and closes it. Closed panels stay in the page as
// hidden="until-found", so the browser's find-in-page opens the one that holds a match.
export function Accordion({
  items,
  multiple = false,
  defaultValue,
  value,
  onValueChange,
  className,
}: AccordionProps) {
  return (
    <BaseAccordion.Root
      className={[styles.accordion, className].filter(Boolean).join(' ')}
      multiple={multiple}
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange ? (next: string[]) => onValueChange(next) : undefined}
      hiddenUntilFound
    >
      {items.map((item) => (
        <BaseAccordion.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={styles.item}
        >
          <BaseAccordion.Header className={styles.header}>
            <BaseAccordion.Trigger className={styles.trigger}>
              {item.title}
              <ChevronDownIcon className={styles.chevron} />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className={styles.panel}>
            <div className={styles.content}>{item.content}</div>
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}
