'use client';

import { useEffect, useRef } from 'react';

import { SessionUserBadge, useSession } from '@/entities/session';
import {
  DropSignInError,
  LoginModal,
  SignOutItems,
  useDropUserQueries,
  useSessionRealtime,
  useSignInAnalytics,
} from '@/features/auth';
import { useFittingEvents } from '@/features/fitting-events';
import { useTrackedElement } from '@/shared/analytics';
import { type AccountSection, accountSections } from '@/shared/config';
import {
  IconButton,
  Menu,
  MenuHeader,
  MenuLinkItem,
  MenuSeparator,
  ProfileIcon,
} from '@/shared/ui';

import styles from './header.module.scss';

// A section of the account (spec 0017 U6, AC2): a link, its clicks and hovers tracked by section.
function SectionLink({ section, title, href }: AccountSection) {
  const tracked = useTrackedElement('profile-menu.section', { section });
  return (
    <MenuLinkItem
      href={href}
      onClick={tracked.onClick}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      {title}
    </MenuLinkItem>
  );
}

// The profile icon (spec 0013 N12, AC1, AC3): signed out, it opens the login modal; signed in, the
// profile menu. While the session loads it is drawn as before, inert (0010 L5). The session is read
// in the browser, so the page stays static. Render it per request inside <Suspense>: the modal
// reads the query.
export function HeaderProfile() {
  const session = useSession();
  useSignInAnalytics(session);
  useDropUserQueries(session);
  useSessionRealtime(session);
  useFittingEvents();
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
        {accountSections.map((section) => (
          <SectionLink key={section.section} {...section} />
        ))}
        <MenuSeparator />
        <SignOutItems />
      </Menu>
    </>
  );
}
