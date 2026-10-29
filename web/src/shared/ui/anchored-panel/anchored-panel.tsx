'use client';

import { Popover } from '@base-ui/react/popover';
import type { ReactNode, RefObject } from 'react';

import { CloseIcon } from '../icon/icons';
import styles from './anchored-panel.module.scss';

export interface AnchoredPanelProps {
  title: string;
  // The control the panel rises over; the focus returns to it when the panel closes.
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Under the content, kept in view while the content scrolls.
  footer?: ReactNode;
  // On the panel itself: `mp-block` for a panel of personal data.
  className?: string;
  children: ReactNode;
}

// Whether a panel is open in the page: a window under it leaves the focus to it, since to Base UI
// it is no nested dialog of that window. `data-open` is Base UI's own attribute of an open popup.
export function anchoredPanelOpen(): boolean {
  return document.querySelector('[data-anchored-panel][data-open]') !== null;
}

// A modal panel rising over its control (spec 0024 R13, plan §4.4): Base UI's Popover, `modal`, the
// rest of the window dimmed and inert, the panel as wide as the control (at most 440px; on a phone
// the window's width less 32px), its start at the control's start. It rises 8px with a fade; Base UI
// puts it under the control when the space above is short, and it comes down there. Escape, the
// backdrop and × close it. It is opened through `open`: the control is the placer's own button.
export function AnchoredPanel({
  title,
  anchor,
  open,
  onOpenChange,
  footer,
  className,
  children,
}: AnchoredPanelProps) {
  return (
    // `modal`: the focus stays inside, which needs the × (Popover.Close) in it.
    <Popover.Root open={open} onOpenChange={onOpenChange} modal>
      <Popover.Portal>
        <Popover.Backdrop className={styles.backdrop} />
        <Popover.Positioner
          className={styles.positioner}
          anchor={anchor}
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
        >
          <Popover.Popup
            className={[styles.popup, className].filter(Boolean).join(' ')}
            finalFocus={anchor}
            data-anchored-panel=""
          >
            <div className={styles.head}>
              <Popover.Title className={styles.title}>{title}</Popover.Title>
              <Popover.Close className={styles.close} aria-label="Закрыть">
                <CloseIcon />
              </Popover.Close>
            </div>
            <div className={styles.content}>{children}</div>
            {footer ? <div className={styles.footer}>{footer}</div> : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
