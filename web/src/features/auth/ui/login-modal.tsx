'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';

import { errorText, reportFailure, signInRedirectText } from '@/shared/api';
import { Button, Modal } from '@/shared/ui';

import { callbackUrl } from '../lib/callback-url';
import { signInRedirectError } from '../lib/sign-in-error';
import { signInWithGoogle } from '../model/auth-actions';
import { useDropSignInError } from '../model/use-drop-sign-in-error';

import styles from './login-modal.module.scss';

export interface LoginModalProps {
  // The control that opens it: the header's profile icon.
  trigger: ReactElement;
}

// The login modal (spec 0013 N12, AC1): one button, "Войти через Google", which leaves for Google
// and comes back to this page signed in. The button waits while the page leaves; a failure shows
// its text under it, and closing the modal clears it. A sign-in that failed at Google comes back
// with its code in the query (N54): the modal opens with the text, and the code leaves the address.
// Render it per request inside <Suspense>: it reads the query (`useSearchParams`).
export function LoginModal({ trigger }: LoginModalProps) {
  const pathname = usePathname();
  const { code: returnedCode, rest } = useDropSignInError();
  const [open, setOpen] = useState(returnedCode !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    returnedCode === null ? null : signInRedirectText(returnedCode),
  );
  useEffect(() => {
    // The visitor's own refusal is not a failure of the site.
    if (returnedCode !== null && returnedCode !== 'access_denied') {
      reportFailure(signInRedirectError(returnedCode));
    }
  }, [returnedCode]);

  // The button keeps waiting while the page leaves for Google; "Back" can bring the page back from
  // the browser's cache as it was, so it stops waiting then.
  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (event.persisted) setPending(false);
    }
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle(callbackUrl(pathname, rest));
    } catch (failure) {
      setError(errorText(failure));
      reportFailure(failure);
      setPending(false);
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setError(null);
  }

  return (
    <Modal trigger={trigger} title="Вход" open={open} onOpenChange={changeOpen}>
      <div className={styles.body}>
        <Button fullWidth loading={pending} onClick={signIn}>
          Войти через Google
        </Button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
