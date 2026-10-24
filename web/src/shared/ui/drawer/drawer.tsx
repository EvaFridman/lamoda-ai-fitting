'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Drawer as BaseDrawer } from '@base-ui/react/drawer';
import { type ReactElement, type ReactNode, type Ref, type RefObject, useId } from 'react';

import { ChevronLeftIcon, CloseIcon } from '../icon/icons';

import styles from './drawer.module.scss';

export interface DrawerProps {
  // The control that opens the drawer, as in Modal: Base UI renders it as the trigger, and the
  // focus returns to it when the drawer closes. Without it, the drawer is opened through `open`.
  trigger?: ReactElement;
  // The heading: the drawer's accessible name.
  title: string;
  // `right` by default: the side modal. `bottom`: a sheet the width of the window rising from its
  // bottom edge, as high as its content up to a strip of the page left above it (spec 0014 O6).
  side?: 'right' | 'bottom';
  // 432px by default, 636px wide; never wider than the window. Only for `right`.
  wide?: boolean;
  // Only for `bottom`: the sheet is always as high as it can be, whatever its content, so a sheet
  // nested in it (a filter's screen over the filters, spec 0020 W30) is as high as it is. A
  // `Drawer` rendered inside another is nested (Base UI): the outer one steps back behind it.
  fullHeight?: boolean;
  // A "‹" before the title that calls this: the way back from a screen of the sheet. Its name is
  // `backLabel`, and it is described by the title ("Назад, Цвет").
  onBack?: () => void;
  backLabel?: string;
  // The "‹" itself, for whoever switches screens to move the focus onto it.
  backRef?: Ref<HTMLButtonElement>;
  // The element focused when the drawer opens, as Modal's; else the sheet itself (Base UI).
  initialFocus?: RefObject<HTMLElement | null>;
  // A control on the right of the title, before the × (a screen's "Сбросить").
  headerAction?: ReactNode;
  // The × at the top right; true by default. Esc, the overlay and a swipe close the drawer anyway.
  closable?: boolean;
  // Buttons pinned under the content. A button that only closes goes in DrawerClose.
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  // `reason` is Base UI's: `outside-press` for a tap outside the sheet (the backdrop), which a
  // sheet nested in another may pass on to close both.
  onOpenChange?: (open: boolean, reason: string) => void;
  // Called once the drawer has slid in or out: a screen reset on closing waits for it, so the
  // sheet does not change while it leaves.
  onOpenChangeComplete?: (open: boolean) => void;
  children?: ReactNode;
}

// Lamoda's side modal (SideModal): a white sheet the height of the window that slides in from the
// right over a dark overlay, a 24/28 heading and a × inside it at the top right (D7ab). Base UI's
// Drawer behaves as Modal does (focus trapped, no page scroll, Esc or a click on the overlay
// close it, the focus returns to the trigger); on a touch screen a swipe to the right (down for
// the bottom sheet) closes it. Opening focuses the sheet itself, or `initialFocus`; in the tab
// order the "‹" comes first, then the header action, the content, the footer and the × last.
export function Drawer({
  trigger,
  title,
  side = 'right',
  wide = false,
  fullHeight = false,
  onBack,
  backLabel = 'Назад',
  backRef,
  initialFocus,
  headerAction,
  closable = true,
  footer,
  open,
  defaultOpen,
  onOpenChange,
  onOpenChangeComplete,
  children,
}: DrawerProps) {
  const titleId = useId();

  return (
    <BaseDrawer.Root
      swipeDirection={side === 'bottom' ? 'down' : 'right'}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={
        onOpenChange ? (next, details) => onOpenChange(next, details.reason) : undefined
      }
      onOpenChangeComplete={onOpenChangeComplete}
    >
      {trigger && <BaseDrawer.Trigger render={trigger} />}
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className={styles.backdrop} />
        <BaseDrawer.Viewport
          className={[styles.viewport, side === 'bottom' && styles.viewportBottom]
            .filter(Boolean)
            .join(' ')}
        >
          <BaseDrawer.Popup
            initialFocus={initialFocus}
            className={[
              styles.popup,
              side === 'bottom' ? styles.bottom : wide && styles.wide,
              side === 'bottom' && fullHeight && styles.fullHeight,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              className={[styles.header, onBack && styles.withBack, closable && styles.withClose]
                .filter(Boolean)
                .join(' ')}
            >
              {onBack && (
                <BaseButton
                  ref={backRef}
                  className={styles.iconControl}
                  aria-label={backLabel}
                  aria-describedby={titleId}
                  onClick={onBack}
                >
                  <ChevronLeftIcon />
                </BaseButton>
              )}
              <BaseDrawer.Title id={titleId} className={styles.title}>
                {title}
              </BaseDrawer.Title>
              {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
            </div>
            <BaseDrawer.Content className={styles.content}>{children}</BaseDrawer.Content>
            {footer && <div className={styles.footer}>{footer}</div>}
            {/* Last, so that opening never focuses the ×. */}
            {closable && (
              <BaseDrawer.Close
                className={[styles.iconControl, styles.close].join(' ')}
                aria-label="Закрыть"
              >
                <CloseIcon />
              </BaseDrawer.Close>
            )}
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
