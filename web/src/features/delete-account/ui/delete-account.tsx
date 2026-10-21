'use client';

import { useRef, useState } from 'react';

import { deleteMe } from '@/entities/user';
import { reset, track, useTrackedElement } from '@/shared/analytics';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { Button, LinkButton, Modal, ModalClose } from '@/shared/ui';

import styles from './delete-account.module.scss';

// Forgets the user in the SDK and loads the home page in full on purpose: the router would keep the
// tab's cache of the deleted user.
function leave() {
  reset();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/');
}

const TEXT =
  'Мы удалим ваши данные, историю примерок и фотографии. Резервные копии хранятся до 7 дней, ' +
  'затем удаляются и они. Отменить удаление нельзя.';

// Account deletion on "Мои данные" (spec 0017 U4, U18, plan §5): "Удалить аккаунт" opens the
// confirmation; "Удалить" deletes the account, sends `Account Deleted` with the user's identity
// before the SDK forgets it, and loads the home page in full, so no cached query or session copy
// of the deleted user survives in the tab. A 401 leaves the same way (U25); any other failure shows
// its text in the modal, which stays open. The modal opens on "Отмена" (U26).
export function DeleteAccount() {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openElement = useTrackedElement('account-delete.open');
  const cancelElement = useTrackedElement('account-delete.cancel');

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await deleteMe();
    } catch (failure) {
      // The session is already gone: the account deleted in another tab, which sent the event, or
      // the session ended there. This tab forgets the user all the same, without the event (U25).
      if (failure instanceof ApiError && failure.kind === 'http' && failure.status === 401) {
        leave();
        return;
      }
      setError(errorText(failure));
      reportFailure(failure);
      setPending(false);
      return;
    }
    // A beacon: the full load below would otherwise drop the event from the SDK's queue.
    track('Account Deleted', {}, { sendNow: true });
    leave();
  }

  // The deletion on its way keeps the modal open: it ends in the home page or in its error.
  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setError(null);
  }

  return (
    <Modal
      trigger={
        <LinkButton
          className={styles.trigger}
          onClick={openElement.onClick}
          onPointerEnter={openElement.onPointerEnter}
          onPointerLeave={openElement.onPointerLeave}
        >
          Удалить аккаунт
        </LinkButton>
      }
      title="Удалить аккаунт?"
      description={TEXT}
      open={open}
      onOpenChange={changeOpen}
      initialFocus={cancelRef}
      footer={
        <>
          <Button loading={pending} onClick={() => void confirm()}>
            Удалить
          </Button>
          <ModalClose>
            <Button
              ref={cancelRef}
              variant="outline"
              disabled={pending}
              onClick={cancelElement.onClick}
              onPointerEnter={cancelElement.onPointerEnter}
              onPointerLeave={cancelElement.onPointerLeave}
            >
              Отмена
            </Button>
          </ModalClose>
        </>
      }
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
