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
}

// The frame of every account page (spec 0017 U5–U7, U10): the side menu with the current section
// marked, and the section's title and content. Below 1024px `/customer` is the list of sections and
// a section is shown alone, with a way back to the list; one DOM, switched by CSS. The session is
// read in the browser (U11): while it loads the content is a placeholder, signed out (a failed
// read too) it is the invitation to sign in.
export function AccountShell({ section, children }: AccountShellProps) {
  const current = accountSections.find((entry) => entry.section === section);

  return (
    <main className={`${styles.shell} ${current ? styles.inSection : styles.atMenu}`}>
      {!current && <h1 className={styles.menuTitle}>Личный кабинет</h1>}
      <AccountMenu current={current?.section} />
      {current && (
        <div className={styles.section}>
          <AccountBackLink />
          <h1 className={styles.title}>{current.title}</h1>
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
