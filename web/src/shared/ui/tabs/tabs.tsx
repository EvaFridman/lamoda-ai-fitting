'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';

import styles from './tabs.module.scss';

export type TabsSize = 'l' | 'm' | 's';

export interface TabItem {
  value: string;
  label: string;
  // A number after the label, in the same style: "Отзывы 54".
  count?: number;
  disabled?: boolean;
  panel: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  // The tab shown first; the first enabled item by default.
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  // `l` 24px (product page), `m` 20px, `s` 16px.
  size?: TabsSize;
  // A name for the tab list, when the page has no heading that already names it.
  'aria-label'?: string;
  className?: string;
}

// Lamoda's tabs: grey labels that turn black on hover and when active, the active one underlined
// 2px black. Base UI's Tabs: the arrows, Home and End move along the tabs and show each panel at
// once (D7v); Tab goes on to the panel.
export function Tabs({
  items,
  defaultValue = items.find((item) => !item.disabled)?.value,
  value,
  onValueChange,
  size = 'l',
  'aria-label': ariaLabel,
  className,
}: TabsProps) {
  return (
    <BaseTabs.Root
      className={[styles.tabs, styles[size], className].filter(Boolean).join(' ')}
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange ? (next: string) => onValueChange(next) : undefined}
    >
      <BaseTabs.List className={styles.list} activateOnFocus aria-label={ariaLabel}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={styles.tab}
          >
            {item.label}
            {item.count === undefined ? null : ` ${item.count}`}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel key={item.value} value={item.value} className={styles.panel}>
          {item.panel}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
