'use client';

import { useEffect, useRef } from 'react';

import { UNSEEN_MAX, unseenBadgeValue, useUnseenCount, withUnseen } from '@/entities/fitting';
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
  CountBadge,
  IconButton,
  Menu,
  MenuHeader,
  MenuLinkItem,
  MenuSeparator,
  ProfileIcon,
} from '@/shared/ui';

import styles from './header.module.scss';
import { BURGER_ID } from './header-menu';

// A section of the account (spec 0017 U6, AC2): a link, its clicks and hovers tracked by section;
// a plain <a> for a section that loads in full (spec 0022 X16). «Мои примерки» carries the count of
// the results not yet seen (spec 0024 AC30), said in its name since the badge is hidden.
function SectionLink({
  section,
  title,
  href,
  fullLoad,
  unseen,
}: AccountSection & { unseen: number }) {
  const tracked = useTrackedElement('profile-menu.section', { section, surface: 'menu' });
  const count = section === 'fittings' ? unseen : 0;
  return (
    <MenuLinkItem
      href={href}
      fullLoad={fullLoad}
      aria-label={count > 0 ? withUnseen(title, count) : undefined}
      onClick={tracked.onClick}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      {title}
      <CountBadge count={count} max={UNSEEN_MAX} className={styles.sectionCount} />
    </MenuLinkItem>
  );
}

// The profile icon (spec 0013 N12, AC1, AC3): signed out, it opens the login modal; signed in, the
// profile menu. While the session loads it is drawn as before, inert (0010 L5). The session is read
// in the browser, so the page stays static. Render it per request inside <Suspense>: the modal
// reads the query. Below 600px the header hides it by CSS but keeps it mounted: its hooks and its
// login modal, the one that answers a failed sign-in's code, run on every width (spec 0019 A87.7).
// Signed in, the icon and the menu's «Мои примерки» carry the count of the results not yet seen
// (spec 0024 AC30); the icon's opening sends `profile-menu.open` (Z26.5).
export function HeaderProfile() {
  const session = useSession();
  useSignInAnalytics(session);
  useDropUserQueries(session);
  useSessionRealtime(session);
  useFittingEvents();
  const signedIn = session.status === 'signed-in';
  // The results not yet seen (spec 0024 AC30): signed out nothing.
  const unseen = useUnseenCount(signedIn);
  const opened = useTrackedElement('profile-menu.open', {
    signed_in: signedIn,
    unseen: unseenBadgeValue(unseen),
  });
  const iconRef = useRef<HTMLButtonElement>(null);
  const wasSignedInRef = useRef(false);
  // On phones the icon is hidden (spec 0019 A87.4), so the modal that opened by itself on a failed
  // sign-in's code gives the focus back to the burger, not to the page.
  const returnFocus = () =>
    iconRef.current?.offsetParent ? true : document.getElementById(BURGER_ID);

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
      <IconButton
        aria-label="Профиль"
        aria-disabled="true"
        variant="plain"
        className={styles.iconButton}
      >
        <ProfileIcon />
      </IconButton>
    );
  }

  const trigger = (
    <IconButton
      ref={iconRef}
      aria-label={withUnseen('Профиль', unseen)}
      variant="plain"
      className={`${styles.iconButton} ${styles.badged}`}
      onClick={opened.onClick}
      onPointerEnter={opened.onPointerEnter}
      onPointerLeave={opened.onPointerLeave}
    >
      <ProfileIcon />
      <CountBadge count={unseen} max={UNSEEN_MAX} className={styles.unseen} />
    </IconButton>
  );

  if (session.status === 'signed-out') {
    return <LoginModal trigger={trigger} finalFocus={returnFocus} />;
  }

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
          <SectionLink key={section.section} {...section} unseen={unseen} />
        ))}
        <MenuSeparator />
        <SignOutItems />
      </Menu>
    </>
  );
}
