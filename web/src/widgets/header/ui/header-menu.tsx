'use client';

import NextLink from 'next/link';
import { useState } from 'react';

import { UNSEEN_MAX, useUnseenCount, withUnseen } from '@/entities/fitting';
import { SessionUserBadge, useSession } from '@/entities/session';
import type { City } from '@/entities/store';
import { LoginModal, type SignOutControl, useSignOuts } from '@/features/auth';
import { CityModal, useCity, useCityOpenEvents } from '@/features/choose-city';
import { useTrackedElement } from '@/shared/analytics';
import { type AccountSection, accountSections } from '@/shared/config';
import { Button, CountBadge, Drawer, IconButton, MenuIcon, Skeleton } from '@/shared/ui';

import { NO_CITY_TEXT } from './city-text';
import headerStyles from './header.module.scss';
import styles from './header-menu.module.scss';

// The burger's id: where the focus goes back on phones after the header's login modal, whose own
// trigger is hidden there (`HeaderProfile`).
export const BURGER_ID = 'header-burger';

// One drawer per page: the catalog's heading names its section and list.
const CATALOG_HEADING_ID = 'header-menu-catalog';

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

// A plain <a> for a section that loads in full (spec 0022 X16). «Мои примерки» carries the count of
// the results not yet seen, said in its name (spec 0024 Z26.1).
function SectionRow({
  section,
  title,
  href,
  fullLoad,
  unseen,
  close,
}: AccountSection & Row & { unseen: number }) {
  const tracked = useTrackedElement('profile-menu.section', { section, surface: 'burger' });
  const count = section === 'fittings' ? unseen : 0;
  const content = (
    <>
      {title}
      <CountBadge count={count} max={UNSEEN_MAX} className={styles.rowCount} />
    </>
  );
  const props = {
    href,
    'aria-label': count > 0 ? withUnseen(title, count) : undefined,
    className: styles.row,
    onClick: () => {
      tracked.onClick();
      close();
    },
    onPointerEnter: tracked.onPointerEnter,
    onPointerLeave: tracked.onPointerLeave,
  };
  return (
    <li>{fullLoad ? <a {...props}>{content}</a> : <NextLink {...props}>{content}</NextLink>}</li>
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

// The city's row (spec 0026 C5, AC7): the drawer closes and «Ваш город» opens, its focus going back
// to the burger when it closes.
function CityRow({ cities, openCity }: { cities: readonly City[] | null; openCity: () => void }) {
  const city = useCity(cities);
  const tracked = useCityOpenEvents('burger', cities);
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => {
          tracked.onClick();
          openCity();
        }}
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
      >
        {city ? `Город: ${city}` : NO_CITY_TEXT}
      </button>
    </li>
  );
}

// The header's menu on phones (spec 0019 A87.6): a drawer from the left. Signed out (a failed read
// too) «Войти» at its top, a second login modal: the header's own, mounted on every width, answers
// a failed sign-in's code (A87.7). Signed in, the initials and the name (no email, 0013 N6), the
// account's sections and the two sign-outs. Then the city's row (spec 0026 C5), one hairline, the
// heading «Каталог» (spec 0024 AC9), «Все товары» and the active categories, the header's list. A
// link closes it. Its items send the profile menu's elements with `surface: 'burger'` (A87.8).
// Render it per request inside <Suspense>: the modal reads the query.
export function HeaderMenu({
  categories,
  cities,
}: {
  categories: readonly HeaderMenuCategory[];
  cities: readonly City[] | null;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const signedIn = session.status === 'signed-in';
  const pending = session.status === 'pending';
  const burger = useTrackedElement('header.burger', { signed_in: signedIn });
  // On phones the profile icon is hidden: the burger carries the results not yet seen (Z26.1).
  const unseen = useUnseenCount(signedIn);
  const close = () => setOpen(false);

  return (
    <>
      <CityModal
        cities={cities}
        open={cityOpen}
        onOpenChange={setCityOpen}
        finalFocus={() => document.getElementById(BURGER_ID)}
      />
      <Drawer
        side="left"
        title="Меню"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <IconButton
            aria-label={withUnseen('Меню', unseen)}
            variant="plain"
            className={`${headerStyles.burger} ${headerStyles.badged}`}
            id={BURGER_ID}
            // While the session loads `signed_in` is not known yet: that click or hover is not counted.
            onClick={pending ? undefined : burger.onClick}
            onPointerEnter={pending ? undefined : burger.onPointerEnter}
            onPointerLeave={pending ? undefined : burger.onPointerLeave}
          >
            <MenuIcon />
            <CountBadge count={unseen} max={UNSEEN_MAX} className={headerStyles.unseen} />
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
                <SectionRow key={section.section} {...section} unseen={unseen} close={close} />
              ))}
              <SignOutRows close={close} />
            </ul>
          </>
        )}
        <ul className={styles.list} aria-label="Город">
          <CityRow
            cities={cities}
            openCity={() => {
              close();
              setCityOpen(true);
            }}
          />
        </ul>
        <section className={styles.catalog} aria-labelledby={CATALOG_HEADING_ID}>
          <h3 id={CATALOG_HEADING_ID} className={styles.heading}>
            Каталог
          </h3>
          <ul className={styles.catalogList} aria-labelledby={CATALOG_HEADING_ID}>
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
        </section>
      </Drawer>
    </>
  );
}
