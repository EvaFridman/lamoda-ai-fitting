'use client';

import { Dialog } from '@base-ui/react/dialog';
import type { ReactElement, ReactNode } from 'react';

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
  children,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      {trigger && <Dialog.Trigger render={trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Viewport className={styles.viewport}>
          <Dialog.Popup className={styles.popup}>
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
