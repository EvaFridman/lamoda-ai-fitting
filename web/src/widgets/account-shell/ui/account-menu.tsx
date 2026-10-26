'use client';

import { useTrackedElement } from '@/shared/analytics';
import { type AccountSection, accountSections } from '@/shared/config';
import { Link } from '@/shared/ui';

import styles from './account-shell.module.scss';

// A section of the menu (spec 0017 U6): a link, its clicks and hovers tracked by section (U14);
// a plain <a> for a section that loads in full (spec 0022 X16).
function MenuLink({
  section,
  title,
  href,
  fullLoad,
  current,
}: Omit<AccountSection, 'fullLoad'> & { fullLoad: boolean; current: boolean }) {
  const tracked = useTrackedElement('account-menu.section', { section });
  return (
    <li>
      <Link
        href={href}
        fullLoad={fullLoad}
        aria-current={current ? 'page' : undefined}
        className={styles.item}
        onClick={tracked.onClick}
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
      >
        {title}
      </Link>
    </li>
  );
}

// The five sections in the header menu's order; the current one marked (AC4). Below 1024px it is
// the list of sections on `/customer` and hidden beside a section (U10). `fullLoad`: every link
// is a plain <a>, on a page that loads in full with its own policy, so leaving it drops that
// policy and its scripts (the stores page's map, spec 0022 X24).
export function AccountMenu({
  current,
  fullLoad = false,
}: {
  current?: AccountSection['section'];
  fullLoad?: boolean;
}) {
  return (
    <nav className={styles.menu} aria-label="Личный кабинет">
      <ul className={styles.list}>
        {accountSections.map((entry) => (
          <MenuLink
            key={entry.section}
            {...entry}
            fullLoad={fullLoad || entry.fullLoad}
            current={entry.section === current}
          />
        ))}
      </ul>
    </nav>
  );
}

// The narrow screen's way back from a section to the list (U10, U18); hidden on a wide screen.
// `fullLoad` as the menu's.
export function AccountBackLink({ fullLoad = false }: { fullLoad?: boolean }) {
  const tracked = useTrackedElement('account-menu.back');
  return (
    <Link
      href="/customer"
      fullLoad={fullLoad}
      className={styles.back}
      onClick={tracked.onClick}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <span aria-hidden="true">‹ </span>
      Личный кабинет
    </Link>
  );
}
