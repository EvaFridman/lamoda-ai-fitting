'use client';

import NextLink from 'next/link';
import { useState } from 'react';

import { SessionUserBadge, useSession } from '@/entities/session';
import { LoginModal, type SignOutControl, useSignOuts } from '@/features/auth';
import { useTrackedElement } from '@/shared/analytics';
import { type AccountSection, accountSections } from '@/shared/config';
import { Button, Drawer, IconButton, MenuIcon, Skeleton } from '@/shared/ui';

import headerStyles from './header.module.scss';
import styles from './header-menu.module.scss';

// The burger's id: where the focus goes back on phones after the header's login modal, whose own
// trigger is hidden there (`HeaderProfile`).
export const BURGER_ID = 'header-burger';

// The header's list, only what the menu shows: no other field of a category reaches the browser.
export interface HeaderMenuCategory {
  id: string;
  slug: string;
  name: string;
}

interface Row {
  // A chosen link or sign-out closes the drawer.
  close: () => void;
}

function SectionRow({ section, title, href, close }: AccountSection & Row) {
  const tracked = useTrackedElement('profile-menu.section', { section, surface: 'burger' });
  return (
    <li>
      <NextLink
        href={href}
        className={styles.row}
        onClick={() => {
          tracked.onClick();
          close();
        }}
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
      >
        {title}
      </NextLink>
    </li>
  );
}

function SignOutRow({ control, label, close }: { control: SignOutControl; label: string } & Row) {
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => {
          close();
          control.onClick();
        }}
        onPointerEnter={control.onPointerEnter}
        onPointerLeave={control.onPointerLeave}
      >
        {label}
      </button>
    </li>
  );
}

function SignOutRows({ close }: Row) {
  const { one, every } = useSignOuts('burger');
  return (
    <>
      <SignOutRow control={one} label="Выйти" close={close} />
      <SignOutRow control={every} label="Выйти со всех устройств" close={close} />
    </>
  );
}

function CatalogRow({
  href,
  title,
  all,
  close,
}: { href: string; title: string; all: boolean } & Row) {
  const tracked = useTrackedElement('burger.category', { all });
  return (
    <li>
      <NextLink
        href={href}
        className={styles.row}
        onClick={() => {
          tracked.onClick();
          close();
        }}
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
      >
        {title}
      </NextLink>
    </li>
  );
}

// The header's menu on phones (spec 0019 A87.6): a drawer from the left. Signed out (a failed read
// too) «Войти» at its top, a second login modal: the header's own, mounted on every width, answers
// a failed sign-in's code (A87.7). Signed in, the initials and the name (no email, 0013 N6), the
// account's sections and the two sign-outs. Then «Все товары» and the active categories, the
// header's list. A link closes it. Its items send the profile menu's elements with
// `surface: 'burger'` (A87.8). Render it per request inside <Suspense>: the modal reads the query.
export function HeaderMenu({ categories }: { categories: readonly HeaderMenuCategory[] }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const signedIn = session.status === 'signed-in';
  const pending = session.status === 'pending';
  const burger = useTrackedElement('header.burger', { signed_in: signedIn });
  const close = () => setOpen(false);

  return (
    <Drawer
      side="left"
      title="Меню"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <IconButton
          aria-label="Меню"
          variant="plain"
          className={headerStyles.burger}
          id={BURGER_ID}
          // While the session loads `signed_in` is not known yet: that click or hover is not counted.
          onClick={pending ? undefined : burger.onClick}
          onPointerEnter={pending ? undefined : burger.onPointerEnter}
          onPointerLeave={pending ? undefined : burger.onPointerLeave}
        >
          <MenuIcon />
        </IconButton>
      }
    >
      {session.status === 'pending' && <Skeleton height={48} />}
      {session.status === 'signed-out' && (
        <LoginModal handlesReturnedError={false} trigger={<Button fullWidth>Войти</Button>} />
      )}
      {session.status === 'signed-in' && (
        <>
          {/* The name is personal data: not recorded (0008). */}
          <div className={`${styles.user} mp-block`}>
            <SessionUserBadge user={session.user} />
          </div>
          <ul className={styles.list} aria-label="Личный кабинет">
            {accountSections.map((section) => (
              <SectionRow key={section.section} {...section} close={close} />
            ))}
            <SignOutRows close={close} />
          </ul>
        </>
      )}
      <ul className={styles.list} aria-label="Каталог">
        <CatalogRow href="/catalog" title="Все товары" all close={close} />
        {categories.map((category) => (
          <CatalogRow
            key={category.id}
            href={`/catalog/${encodeURIComponent(category.slug)}`}
            title={category.name}
            all={false}
            close={close}
          />
        ))}
      </ul>
    </Drawer>
  );
}
