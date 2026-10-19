'use client';

import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ReactElement, ReactNode } from 'react';

import styles from './menu.module.scss';

export type MenuAlign = 'start' | 'center' | 'end';

export interface MenuProps {
  // The control that opens the menu: an IconButton, a Button or another element that takes a ref
  // and props. Base UI renders it as the trigger with aria-haspopup and aria-expanded, so Enter,
  // Space, the down arrow or a click open the menu, and the focus returns to it when it closes.
  trigger: ReactElement;
  // The menu's edge lined up with the trigger's: "end" for a control at the right of the header.
  align?: MenuAlign;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // MenuItem, MenuSeparator and, above the items, MenuHeader.
  children: ReactNode;
}

// A dropdown of actions under a control (Base UI Menu), the look of Lamoda's profile menu: a white
// box with the box shadow, items of 16px text in a column. The focus moves into the menu as it
// opens; the arrows move between the items, a letter jumps to the item that starts with it, Enter,
// Space or a click run an item and close the menu, Esc or a click outside close it. The page keeps
// scrolling while it is open (modal={false}), as with Select.
export function Menu({
  trigger,
  align = 'start',
  open,
  defaultOpen,
  onOpenChange,
  children,
}: MenuProps) {
  return (
    <BaseMenu.Root
      modal={false}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className={styles.positioner} align={align} sideOffset={8}>
          <BaseMenu.Popup className={styles.popup}>{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

// Base UI's item props (onClick, the pointer handlers of useTrackedElement), with our own look.
export interface MenuItemProps extends Omit<BaseMenu.Item.Props, 'className' | 'render'> {
  // Drawn grey and runs nothing; it keeps the focus and the arrows stop on it, and screen readers
  // hear it as unavailable (aria-disabled).
  disabled?: boolean;
  children: ReactNode;
}

// One action of the menu: role="menuitem".
export function MenuItem({ children, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item className={styles.item} {...props}>
      {children}
    </BaseMenu.Item>
  );
}

export interface MenuHeaderProps {
  // Added to the block: `mp-block` for one that shows personal data (the user's name).
  className?: string;
  children: ReactNode;
}

// A block above the items (the profile menu's initials and name). A menu may hold only items,
// groups and separators, so it is role="none": the arrows pass it by and screen readers in the
// menu read the items only.
export function MenuHeader({ className, children }: MenuHeaderProps) {
  return (
    <div role="none" className={[styles.header, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

// A thin line between groups of items: role="separator".
export function MenuSeparator() {
  return <BaseMenu.Separator className={styles.separator} />;
}
