'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { SessionState } from '@/entities/session';
import { userKeys } from '@/entities/user';

// A sign-out does not reload the page, so the user's own answers (`/me`) would stay in the query
// cache for the next person at this tab (spec 0017 U22). They go whenever the session ends, as the
// analytics identity does (`useSignInAnalytics`): a sign-out here, in another tab or browser, its
// expiry; a failed read is not an end. They go too when the tab sees another user signed in with no
// end seen in between (the end's read failed, or happened while the tab was not reading). Mounted
// once, by the header's profile icon.
export function useDropUserQueries(session: SessionState): void {
  const queryClient = useQueryClient();
  const signedOut = session.status === 'signed-out' && !session.failed;
  const id = session.status === 'signed-in' ? session.user.id : undefined;
  const lastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (signedOut) queryClient.removeQueries({ queryKey: userKeys.all });
  }, [queryClient, signedOut]);

  useEffect(() => {
    if (id === undefined) return;
    // Reset, not removed: a page that shows them reads them again, now as the new user.
    if (lastIdRef.current !== undefined && lastIdRef.current !== id) {
      void queryClient.resetQueries({ queryKey: userKeys.all });
    }
    lastIdRef.current = id;
  }, [queryClient, id]);
}
