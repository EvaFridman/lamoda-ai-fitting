import NextLink from 'next/link';
import { Suspense } from 'react';

import { FittingRoomButton } from '@/entities/fitting-room';
import {
  BagIcon,
  ChevronDownIcon,
  HeartIcon,
  IconButton,
  MenuIcon,
  ProfileIcon,
  SearchField,
  SearchIcon,
} from '@/shared/ui';

import styles from './header.module.scss';
import { HeaderCategories } from './header-categories';
import { HeaderMenuSlot } from './header-menu-slot';
import { HeaderProfileSlot } from './header-profile-slot';
import { HeaderRoomSlot } from './header-room-slot';
import { HeaderLoupeSlot, HeaderSearchSlot } from './header-search-slot';
import { HeaderSearchToggleProvider } from './header-search-toggle';
import { Logo } from './logo';

// Lamoda's site header without the announcement bar (spec 0010 L2): the gender switch and the city,
// the logo, the profile, favourites and cart; under them the category row and the search field.
// The switch, the city, favourites and the cart are drawn as on Lamoda and do nothing yet (L5): they
// say so to assistive technology with `aria-disabled`, have no handler and stay in the tab order.
// The profile icon signs in and opens the profile menu (spec 0013 N12); the fitting room's hanger,
// between favourites and the cart, opens the room (spec 0019 A10).
// Below 600px it is Lamoda's phone row (spec 0019 A87.4): the burger and the loupe, the logo,
// favourites, the fitting room and the cart; the switch, the city, the profile icon and the category row are hidden
// by CSS, not unmounted, so the profile's hooks and its login modal run once on every width (A87.7).
export function Header() {
  return (
    <header className={styles.header}>
      <HeaderSearchToggleProvider className={styles.inner}>
        <Suspense
          fallback={
            <IconButton
              aria-label="Меню"
              aria-disabled="true"
              variant="plain"
              className={styles.burger}
            >
              <MenuIcon />
            </IconButton>
          }
        >
          <HeaderMenuSlot />
        </Suspense>
        <Suspense
          fallback={
            <IconButton
              aria-label="Поиск"
              aria-disabled="true"
              variant="plain"
              className={styles.loupe}
            >
              <SearchIcon />
            </IconButton>
          }
        >
          <HeaderLoupeSlot />
        </Suspense>

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
          <div className={styles.profile}>
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
          </div>
          <IconButton aria-label="Избранное" aria-disabled="true" className={styles.iconButton}>
            <HeartIcon />
          </IconButton>
          <Suspense
            fallback={
              <FittingRoomButton count={0} aria-disabled="true" className={styles.iconButton} />
            }
          >
            <HeaderRoomSlot />
          </Suspense>
          <IconButton aria-label="Корзина" aria-disabled="true" className={styles.iconButton}>
            <BagIcon />
          </IconButton>
        </div>

        <div className={styles.categories}>
          <Suspense fallback={null}>
            <HeaderCategories />
          </Suspense>
        </div>

        {/* The fallback is the same field, empty, so the row keeps its height (plan §3). */}
        <Suspense
          fallback={
            <div className={styles.search}>
              <SearchField />
            </div>
          }
        >
          <HeaderSearchSlot />
        </Suspense>
      </HeaderSearchToggleProvider>
    </header>
  );
}
