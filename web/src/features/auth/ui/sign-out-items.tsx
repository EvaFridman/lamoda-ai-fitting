'use client';

import { MenuItem } from '@/shared/ui';

import { type SignOutSurface, useSignOuts } from '../model/use-sign-outs';

// The two last items of the profile menu (spec 0013 N12, AC4): "Выйти" and "Выйти со всех
// устройств". Each item takes one `onClick`: whatever else should run on a click goes into it, the
// tracked click too. The burger shows the same two as buttons through `useSignOuts`.
export function SignOutItems({ surface = 'menu' }: { surface?: SignOutSurface }) {
  const { one, every } = useSignOuts(surface);
  return (
    <>
      <MenuItem
        onClick={one.onClick}
        onPointerEnter={one.onPointerEnter}
        onPointerLeave={one.onPointerLeave}
      >
        Выйти
      </MenuItem>
      <MenuItem
        onClick={every.onClick}
        onPointerEnter={every.onPointerEnter}
        onPointerLeave={every.onPointerLeave}
      >
        Выйти со всех устройств
      </MenuItem>
    </>
  );
}
