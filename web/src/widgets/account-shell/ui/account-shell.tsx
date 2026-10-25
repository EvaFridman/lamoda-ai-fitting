'use client';

import type { ReactNode } from 'react';

import { useSession } from '@/entities/session';
import { type AccountSection, accountSections } from '@/shared/config';
import { Skeleton } from '@/shared/ui';

import { AccountBackLink, AccountMenu } from './account-menu';
import { AccountInvite } from './account-invite';
import styles from './account-shell.module.scss';

export interface AccountShellProps {
  // The section shown beside the menu; none on `/customer`, which shows only the menu (spec 0017
  // U5).
  section?: AccountSection['section'];
  // The section's content under its title, shown signed in only.
  children?: ReactNode;
  // A block under the side menu, signed in only and on a wide screen, where the menu shows: the
  // history's `LimitMeter` (spec 0019 board 9, A78).
  aside?: ReactNode;
  // A page inside a section: its own title in place of the section's, and its own way back on
  // every width in place of «‹ Личный кабинет» (the compare page, spec 0019 A93).
  title?: string;
  back?: ReactNode;
}

// The frame of every account page (spec 0017 U5–U7, U10): the side menu with the current section
// marked, and the section's title and content. Below 1024px `/customer` is the list of sections and
// a section is shown alone, with a way back to the list; one DOM, switched by CSS. The session is
// read in the browser (U11): while it loads the content is a placeholder, signed out (a failed
// read too) it is the invitation to sign in.
export function AccountShell({ section, children, aside, title, back }: AccountShellProps) {
  const current = accountSections.find((entry) => entry.section === section);

  return (
    <main className={`${styles.shell} ${current ? styles.inSection : styles.atMenu}`}>
      {!current && <h1 className={styles.menuTitle}>Личный кабинет</h1>}
      <div className={styles.side}>
        <AccountMenu current={current?.section} />
        {aside && <SignedInAside>{aside}</SignedInAside>}
      </div>
      {current && (
        <div className={styles.section}>
          {back ? <div className={styles.ownBack}>{back}</div> : <AccountBackLink />}
          <h1 className={styles.title}>{title ?? current.title}</h1>
          <SectionContent>{children}</SectionContent>
        </div>
      )}
    </main>
  );
}

function SectionContent({ children }: { children: ReactNode }) {
  const session = useSession();

  if (session.status === 'pending') {
    return (
      <div className={styles.placeholder} aria-busy="true">
        <Skeleton height={20} width="60%" />
        <Skeleton height={20} width="40%" />
      </div>
    );
  }
  if (session.status === 'signed-out') return <AccountInvite />;
  return children;
}

// The block under the menu reads the user's data, so it renders only once the session is read
// signed in.
function SignedInAside({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status !== 'signed-in') return null;
  return children;
}
