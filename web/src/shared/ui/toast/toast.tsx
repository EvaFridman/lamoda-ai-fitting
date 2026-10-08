'use client';

import { Toast as BaseToast } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

import { CloseIcon } from '../icon/icons';

import styles from './toast.module.scss';

export type ToastTone = 'default' | 'error';

export interface ShowToastOptions {
  // The message, one or two lines.
  title: string;
  // `error`: red, and a screen reader announces it at once instead of after what it is reading.
  tone?: ToastTone;
  // A button after the message ("Вернуть"); pressing it calls `onAction` and closes the toast.
  actionLabel?: string;
  onAction?: () => void;
}

// One manager for the whole app, so a toast can be shown from anywhere, a mutation's onError
// included, without a hook (D7ad). ToastProvider renders what it holds.
const toastManager = BaseToast.createToastManager();

// Shows a toast at the bottom of the screen; it goes away after 5s. Returns its id. Call it in the
// browser only (an event handler, an effect): the manager is one per module, so a call during a
// server render would be shared by every request.
export function showToast({ title, tone = 'default', actionLabel, onAction }: ShowToastOptions) {
  const id: string = toastManager.add({
    title,
    type: tone,
    priority: tone === 'error' ? 'high' : 'low',
    actionProps:
      actionLabel === undefined
        ? undefined
        : {
            children: actionLabel,
            // Closed first: Base UI then moves the focus out of the toast (back where it was
            // before), so a toast that onAction shows is not added while the focus is inside the
            // region, which would keep its timer paused and lose the focus to <body>.
            onClick: () => {
              toastManager.close(id);
              onAction?.();
            },
          },
  });
  return id;
}

// Renders the toasts of showToast for the whole app (in _app/providers.tsx). Base UI's Toast: the
// toasts sit in a region "Уведомления" that screen readers hear politely, F6 moves the focus
// there, and a toast's timer stops while the pointer is on it, while it has the focus and while
// the window is in the background (D7ae).
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider toastManager={toastManager} timeout={5000} limit={3}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className={styles.viewport} aria-label="Уведомления">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

// Lamoda's snackbar: a dark bar with white 16/20 text, the action and a ×; the error tone is red.
function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} className={styles.toast}>
      <BaseToast.Content className={styles.content}>
        {/* A paragraph, not Base UI's default h2: the toast is named through aria-labelledby,
            and a heading would join the page's outline. */}
        <BaseToast.Title className={styles.title} render={<p />} />
        {toast.actionProps && <BaseToast.Action className={styles.action} />}
        {/* Base UI hides the × from screen readers while a stack is collapsed; ours are always
            shown one under the other, so it stays visible to them too. */}
        <BaseToast.Close className={styles.close} aria-label="Закрыть" aria-hidden={false}>
          <CloseIcon />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}
