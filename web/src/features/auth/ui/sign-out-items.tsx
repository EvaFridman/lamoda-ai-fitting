'use client';

import { errorText, reportFailure } from '@/shared/api';
import { MenuItem, showToast } from '@/shared/ui';

import { signOut, signOutEverywhere } from '../model/auth-actions';

// A sign-out that failed says so in a toast: the menu has closed by then.
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (failure) {
    showToast({ title: errorText(failure), tone: 'error' });
    reportFailure(failure);
  }
}

// The two last items of the profile menu (spec 0013 N12, AC4): "Выйти" and "Выйти со всех
// устройств". Each item takes one `onClick`: whatever else should run on a click goes into it.
export function SignOutItems() {
  return (
    <>
      <MenuItem onClick={() => void run(signOut)}>Выйти</MenuItem>
      <MenuItem onClick={() => void run(signOutEverywhere)}>Выйти со всех устройств</MenuItem>
    </>
  );
}
