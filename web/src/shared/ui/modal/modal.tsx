'use client';

import { Dialog } from '@base-ui/react/dialog';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';

import { CloseIcon } from '../icon/icons';

import styles from './modal.module.scss';

export interface ModalProps {
  // The control that opens the modal: a Button or another element that takes a ref and props.
  // Base UI renders it as the trigger, so Enter, Space or a click open the modal, and the focus
  // returns to it when the modal closes. Without it, the modal is opened through `open`.
  trigger?: ReactElement;
  // The heading: the modal's accessible name.
  title: string;
  // A line under the heading, read with the name by screen readers.
  description?: string;
  // Buttons under the content, aligned to the right. A button that only closes goes in ModalClose.
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // The element focused when the modal opens, for a modal whose first button must not be: the
  // safe "Отмена" before a destructive "Удалить". `popup`: the frame itself, for a long screen
  // whose first control is far down, so nothing scrolls on opening (spec 0019's tips). By default,
  // the first focusable element.
  initialFocus?: RefObject<HTMLElement | null> | 'popup';
  // Up to 1000px wide for a screen of its own (spec 0019 boards 4 and 5); below 600px it fills the
  // window and its × moves inside, at the top right.
  wide?: boolean;
  // A picture in a column left of the heading, the content and the buttons (board 5's photo); on top
  // of them below 600px.
  media?: ReactNode;
  children?: ReactNode;
}

// Lamoda's modal (d-modal): a white frame in the middle of a dark overlay, a 24/28 heading, the
// content and the buttons under it, and a white × outside the frame, at its top right corner (D7ab).
// Base UI's Dialog: the focus moves inside and stays there, the page does not scroll, Esc, a click
// on the overlay or the × close it, and the focus returns to the trigger.
export function Modal({
  trigger,
  title,
  description,
  footer,
  open,
  defaultOpen,
  onOpenChange,
  initialFocus,
  wide = false,
  media,
  children,
}: ModalProps) {
  // `media={cond && picture}` with a false `cond` is no picture.
  const hasMedia = media !== undefined && media !== null && media !== false;
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      {trigger && <Dialog.Trigger render={trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Viewport
          className={[styles.viewport, wide && styles.wideViewport].filter(Boolean).join(' ')}
        >
          <Dialog.Popup
            className={[styles.popup, wide && styles.wide, hasMedia && styles.withMedia]
              .filter(Boolean)
              .join(' ')}
            ref={popupRef}
            initialFocus={initialFocus === 'popup' ? popupRef : initialFocus}
          >
            {hasMedia && <div className={styles.media}>{media}</div>}
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <div className={styles.content}>
              {description && (
                <Dialog.Description className={styles.description}>
                  {description}
                </Dialog.Description>
              )}
              {children}
            </div>
            {footer && <div className={styles.footer}>{footer}</div>}
            <Dialog.Close className={styles.close} aria-label="Закрыть">
              <CloseIcon />
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Renders its child (a Button) as a control that closes the modal it is in: "Отмена" in the footer.
export function ModalClose({ children }: { children: ReactElement }) {
  return <Dialog.Close render={children} />;
}
