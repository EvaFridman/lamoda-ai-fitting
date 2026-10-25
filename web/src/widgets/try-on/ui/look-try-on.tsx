'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useRoomStore } from '@/entities/fitting-room';
import { useSession } from '@/entities/session';

import { TryOn } from './try-on';

// The look's try-on (spec 0019 T26, board 3.2), mounted once in the root layout beside the fitting
// room's drawer: the drawer's «Примерить образ» opens it through the room's store, since a widget
// imports no widget. Signed in only; a new page (an item's link on the result), the session's end
// and another user close it. Rendered while open, so closing deletes the window's one-time photo (A70).
export function LookTryOn() {
  const session = useSession();
  const open = useRoomStore((state) => state.lookOpen);
  const setOpen = useRoomStore((state) => state.setLookOpen);
  const pathname = usePathname();
  const shownPathRef = useRef(pathname);

  useEffect(() => {
    if (shownPathRef.current === pathname) return;
    shownPathRef.current = pathname;
    setOpen(false);
  }, [pathname, setOpen]);

  // Another user signed in with no end seen in between closes it too: the window's state (a
  // one-time photo's link) is the previous user's (spec 0017 U22).
  const userId = session.status === 'signed-in' ? session.user.id : null;
  const shownUserRef = useRef(userId);
  useEffect(() => {
    if (session.status === 'pending') return;
    if (shownUserRef.current === userId) return;
    shownUserRef.current = userId;
    setOpen(false);
  }, [session.status, userId, setOpen]);

  if (!open || userId === null) return null;
  // Keyed by the user, so no state of one user's window is ever rendered for another.
  return <TryOn key={userId} look onClose={() => setOpen(false)} />;
}
