'use client';

import { Suspense } from 'react';

import { LoginModal } from '@/features/auth';
import { useTrackedElement } from '@/shared/analytics';
import { Button } from '@/shared/ui';

import styles from './account-shell.module.scss';

// In place of a section for a signed-out visitor (spec 0017 U7, U18): the button opens the login
// modal, which comes back to this address signed in. No redirect. A sign-in that failed at Google is
// answered by the header's modal, so this one does not open too. The modal reads the query, so it
// renders inside <Suspense>; until then the button is drawn inert.
export function AccountInvite() {
  const tracked = useTrackedElement('account-invite.sign-in');
  return (
    <div className={styles.invite}>
      <p className={styles.text}>Войдите, чтобы открыть личный кабинет</p>
      <Suspense fallback={<Button aria-disabled="true">Войти</Button>}>
        <LoginModal
          handlesReturnedError={false}
          trigger={
            <Button
              onClick={tracked.onClick}
              onPointerEnter={tracked.onPointerEnter}
              onPointerLeave={tracked.onPointerLeave}
            >
              Войти
            </Button>
          }
        />
      </Suspense>
    </div>
  );
}
