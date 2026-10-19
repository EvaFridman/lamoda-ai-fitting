import NextLink from 'next/link';
import { Suspense } from 'react';

import {
  BagIcon,
  ChevronDownIcon,
  HeartIcon,
  IconButton,
  ProfileIcon,
  SearchField,
} from '@/shared/ui';

import styles from './header.module.scss';
import { HeaderCategories } from './header-categories';
import { HeaderProfileSlot } from './header-profile-slot';
import { HeaderSearchSlot } from './header-search-slot';
import { Logo } from './logo';

const userNav = [
  { label: 'Избранное', Icon: HeartIcon },
  { label: 'Корзина', Icon: BagIcon },
];

// Lamoda's site header without the announcement bar (spec 0010 L2): the gender switch and the city,
// the logo, the profile, favourites and cart; under them the category row and the search field.
// The switch, the city, favourites and the cart are drawn as on Lamoda and do nothing yet (L5): they
// say so to assistive technology with `aria-disabled`, have no handler and stay in the tab order.
// The profile icon signs in and opens the profile menu (spec 0013 N12).
export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.place}>
          <button
            type="button"
            className={`${styles.textButton} ${styles.gender}`}
            aria-disabled="true"
          >
            Женщинам
            <ChevronDownIcon size={16} />
          </button>
          <button
            type="button"
            className={`${styles.textButton} ${styles.city}`}
            aria-disabled="true"
          >
            Укажите ваш населенный пункт
          </button>
        </div>

        <NextLink href="/" className={styles.logo} aria-label="Lamoda, на главную">
          <Logo />
        </NextLink>

        <div className={styles.userNav}>
          {/* The fallback is the profile icon as it is while the session loads. */}
          <Suspense
            fallback={
              <IconButton aria-label="Профиль" aria-disabled="true" className={styles.iconButton}>
                <ProfileIcon />
              </IconButton>
            }
          >
            <HeaderProfileSlot />
          </Suspense>
          {userNav.map(({ label, Icon }) => (
            <IconButton
              key={label}
              aria-label={label}
              aria-disabled="true"
              className={styles.iconButton}
            >
              <Icon />
            </IconButton>
          ))}
        </div>

        <div className={styles.categories}>
          <Suspense fallback={null}>
            <HeaderCategories />
          </Suspense>
        </div>

        <div className={styles.search}>
          {/* The fallback is the same field, empty, so the row keeps its height (plan §3). */}
          <Suspense fallback={<SearchField />}>
            <HeaderSearchSlot />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
