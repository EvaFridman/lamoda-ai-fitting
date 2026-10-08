'use client';

import { Drawer as BaseDrawer } from '@base-ui/react/drawer';
import type { ReactElement, ReactNode } from 'react';

import { CloseIcon } from '../icon/icons';

import styles from './drawer.module.scss';

export interface DrawerProps {
  // The control that opens the drawer, as in Modal: Base UI renders it as the trigger, and the
  // focus returns to it when the drawer closes. Without it, the drawer is opened through `open`.
  trigger?: ReactElement;
  // The heading: the drawer's accessible name.
  title: string;
  // 432px by default, 636px wide; never wider than the window.
  wide?: boolean;
  // Buttons pinned under the content. A button that only closes goes in DrawerClose.
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

// Lamoda's side modal (SideModal): a white sheet the height of the window that slides in from the
// right over a dark overlay, a 24/28 heading and a × inside it at the top right (D7ab). Base UI's
// Drawer behaves as Modal does (focus trapped, no page scroll, Esc or a click on the overlay
// close it, the focus returns to the trigger); on a touch screen a swipe to the right closes it.
export function Drawer({
  trigger,
  title,
  wide = false,
  footer,
  open,
  defaultOpen,
  onOpenChange,
  children,
}: DrawerProps) {
  return (
    <BaseDrawer.Root
      swipeDirection="right"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      {trigger && <BaseDrawer.Trigger render={trigger} />}
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className={styles.backdrop} />
        <BaseDrawer.Viewport className={styles.viewport}>
          <BaseDrawer.Popup
            className={[styles.popup, wide && styles.wide].filter(Boolean).join(' ')}
          >
            <BaseDrawer.Title className={styles.title}>{title}</BaseDrawer.Title>
            <BaseDrawer.Content className={styles.content}>{children}</BaseDrawer.Content>
            {footer && <div className={styles.footer}>{footer}</div>}
            <BaseDrawer.Close className={styles.close} aria-label="Закрыть">
              <CloseIcon />
            </BaseDrawer.Close>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}

// Renders its child (a Button) as a control that closes the drawer it is in.
export function DrawerClose({ children }: { children: ReactElement }) {
  return <BaseDrawer.Close render={children} />;
}
