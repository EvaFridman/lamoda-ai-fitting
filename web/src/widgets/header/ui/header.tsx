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
import { HeaderSearchSlot } from './header-search-slot';
import { Logo } from './logo';

const userNav = [
  { label: 'Профиль', Icon: ProfileIcon },
  { label: 'Избранное', Icon: HeartIcon },
  { label: 'Корзина', Icon: BagIcon },
];

// Lamoda's site header without the announcement bar (spec 0010 L2): the gender switch and the city,
// the logo, the profile, favourites and cart; under them the category row and the search field.
// The switch, the city and the icons are drawn as on Lamoda and do nothing yet (L5): they say so to
// assistive technology with `aria-disabled`, have no handler and stay in the tab order.
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
