'use client';

import { useEffect, useRef } from 'react';

import { SessionUserBadge, useSession } from '@/entities/session';
import { DropSignInError, LoginModal, SignOutItems, useSignInAnalytics } from '@/features/auth';
import { IconButton, Menu, MenuHeader, MenuItem, MenuSeparator, ProfileIcon } from '@/shared/ui';

import styles from './header.module.scss';

// The profile's pages come with their own specs (N12): drawn here, inert, marked disabled.
const pages = ['Мои заказы', 'Магазины', 'Мои данные', 'Мои примерки'];

// The profile icon (spec 0013 N12, AC1, AC3): signed out, it opens the login modal; signed in, the
// profile menu. While the session loads it is drawn as before, inert (0010 L5). The session is read
// in the browser, so the page stays static. Render it per request inside <Suspense>: the modal
// reads the query.
export function HeaderProfile() {
  const session = useSession();
  useSignInAnalytics(session);
  const iconRef = useRef<HTMLButtonElement>(null);
  const wasSignedInRef = useRef(false);

  // A sign-out from the menu replaces the menu's icon with the modal's: the focus, left on the page,
  // goes back to the icon, as when the menu closes.
  useEffect(() => {
    if (
      session.status === 'signed-out' &&
      wasSignedInRef.current &&
      document.activeElement === document.body
    ) {
      iconRef.current?.focus();
    }
    wasSignedInRef.current = session.status === 'signed-in';
  }, [session.status]);

  if (session.status === 'pending') {
    return (
      <IconButton aria-label="Профиль" aria-disabled="true" className={styles.iconButton}>
        <ProfileIcon />
      </IconButton>
    );
  }

  const trigger = (
    <IconButton ref={iconRef} aria-label="Профиль" className={styles.iconButton}>
      <ProfileIcon />
    </IconButton>
  );

  if (session.status === 'signed-out') return <LoginModal trigger={trigger} />;

  return (
    <>
      {/* A failed sign-in's code left in the address would open the modal after a sign-out. */}
      <DropSignInError />
      <Menu trigger={trigger} align="end">
        {/* The name is personal data: not recorded (0008). */}
        <MenuHeader className="mp-block">
          <SessionUserBadge user={session.user} />
        </MenuHeader>
        {pages.map((page) => (
          <MenuItem key={page} disabled>
            {page}
          </MenuItem>
        ))}
        <MenuSeparator />
        <SignOutItems />
      </Menu>
    </>
  );
}
