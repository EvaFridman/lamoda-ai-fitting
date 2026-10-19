'use client';

import { useEffect } from 'react';

import type { SessionState } from '@/entities/session';
import { identify, reset } from '@/shared/analytics';

import { takeSignInStarted } from '../lib/sign-in-flag';

// Identifies the signed-in user on every page load, after consent, and counts `Signed In` once on
// the page a sign-in of this tab came back to (spec 0013 plan §10, N13). Signed out, the user is
// forgotten however the session ended: a sign-out here (`SignOutItems` counts it first), in another
// tab or browser, or its expiry; a failed read is not an end. Mounted once, by the header's profile
// icon.
export function useSignInAnalytics(session: SessionState): void {
  const id = session.status === 'signed-in' ? session.user.id : undefined;
  const signedOut = session.status === 'signed-out' && !session.failed;
  useEffect(() => {
    if (id !== undefined) identify(id, { signedIn: takeSignInStarted() });
    else if (signedOut) reset();
  }, [id, signedOut]);
}
