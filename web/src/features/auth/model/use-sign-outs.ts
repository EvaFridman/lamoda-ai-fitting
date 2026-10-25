'use client';

import type { PointerEvent } from 'react';

import { reset, track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { showToast } from '@/shared/ui';

import { signOut, signOutEverywhere } from './auth-actions';

// Where the sign-outs are shown: the header's profile menu or, on phones, its burger (spec 0019
// A87.8).
export type SignOutSurface = 'menu' | 'burger';

export interface SignOutControl {
  onClick: () => void;
  onPointerEnter: (event: PointerEvent) => void;
  onPointerLeave: () => void;
}

// A sign-out that failed says so in a toast: the menu has closed by then. One that succeeded is
// counted and forgets the user in analytics (spec 0013 N13), the event first, so it is the user's.
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (failure) {
    showToast({ title: errorText(failure), tone: 'error' });
    reportFailure(failure);
    return;
  }
  track('Signed Out', {});
  reset();
}

// "Выйти" and "Выйти со всех устройств" (spec 0013 N12, AC4): each control's handlers, its tracked
// click and hover included, for whichever element shows it.
export function useSignOuts(surface: SignOutSurface): {
  one: SignOutControl;
  every: SignOutControl;
} {
  const one = useTrackedElement('profile-menu.sign-out', { surface });
  const every = useTrackedElement('profile-menu.sign-out-everywhere', { surface });
  return {
    one: {
      onClick: () => {
        one.onClick();
        void run(signOut);
      },
      onPointerEnter: one.onPointerEnter,
      onPointerLeave: one.onPointerLeave,
    },
    every: {
      onClick: () => {
        every.onClick();
        void run(signOutEverywhere);
      },
      onPointerEnter: every.onPointerEnter,
      onPointerLeave: every.onPointerLeave,
    },
  };
}
