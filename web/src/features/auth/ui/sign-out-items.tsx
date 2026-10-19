'use client';

import { reset, track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { MenuItem, showToast } from '@/shared/ui';

import { signOut, signOutEverywhere } from '../model/auth-actions';

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

// The two last items of the profile menu (spec 0013 N12, AC4): "Выйти" and "Выйти со всех
// устройств". Each item takes one `onClick`: whatever else should run on a click goes into it, the
// tracked click too.
export function SignOutItems() {
  const one = useTrackedElement('profile-menu.sign-out');
  const every = useTrackedElement('profile-menu.sign-out-everywhere');
  return (
    <>
      <MenuItem
        onClick={() => {
          one.onClick();
          void run(signOut);
        }}
        onPointerEnter={one.onPointerEnter}
        onPointerLeave={one.onPointerLeave}
      >
        Выйти
      </MenuItem>
      <MenuItem
        onClick={() => {
          every.onClick();
          void run(signOutEverywhere);
        }}
        onPointerEnter={every.onPointerEnter}
        onPointerLeave={every.onPointerLeave}
      >
        Выйти со всех устройств
      </MenuItem>
    </>
  );
}
