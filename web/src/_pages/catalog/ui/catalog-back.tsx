'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { useTrackedElement } from '@/shared/analytics';
import { ArrowBackIcon } from '@/shared/ui';

import { type BackTarget, backTarget, CATALOG_PATH } from '../lib/back-target';
import { documentPathname } from '../lib/document-entry';

import styles from './catalog-page.module.scss';

// Whether the tab has shown a path other than the document's, till it reloads: a step made before
// the catalog mounted (from the account, say) counts too (spec 0020 plan §2).
const tab = { stepped: false };

// Next pushes a step's entry after the new page renders, so the arrow reads the index again once
// the current entry changes. Next pushes it inside `useInsertionEffect`, where the event fires at
// once and React refuses an update: the arrow reads it a microtask later.
function subscribe(listener: () => void): () => void {
  if (!('navigation' in window)) return () => {};
  const { navigation } = window;
  const later = () => queueMicrotask(listener);
  navigation.addEventListener('currententrychange', later);
  return () => navigation.removeEventListener('currententrychange', later);
}

function steppedTo(pathname: string): boolean {
  const loaded = documentPathname();
  return tab.stepped || (loaded !== undefined && loaded !== pathname);
}

// The Navigation API's index of the current entry, where the browser has it (W26).
function entryIndex(): number | undefined {
  if (!('navigation' in window)) return undefined;
  return window.navigation.currentEntry?.index;
}

// The server knows no history: a link to the catalog on a category's page, nothing on `/catalog`.
function serverTarget(pathname: string): BackTarget | null {
  return pathname === CATALOG_PATH ? null : 'catalog';
}

// The heading's "←" below a 600px window (spec 0020 W4, AC4). Its slot keeps its width whether the
// arrow shows or not, so its appearance after hydration moves nothing. The link works without
// JavaScript; once the tab knows the previous page was this site's, a button goes back instead.
export function CatalogBack() {
  const pathname = usePathname();
  const router = useRouter();
  const target = useSyncExternalStore(
    subscribe,
    () =>
      backTarget({
        pathname,
        entryIndex: entryIndex(),
        stepped: steppedTo(pathname),
        referrer: document.referrer,
        origin: window.location.origin,
        hasHistory: window.history.length > 1,
      }),
    () => serverTarget(pathname),
  );
  useEffect(() => {
    if (steppedTo(pathname)) tab.stepped = true;
  }, [pathname]);
  const events = useTrackedElement('catalog.back', { target: target ?? 'catalog' });

  let control = null;
  if (target === 'history') {
    control = (
      <button
        type="button"
        className={styles.backControl}
        aria-label="Назад"
        {...events}
        onClick={() => {
          events.onClick();
          router.back();
        }}
      >
        <ArrowBackIcon />
      </button>
    );
  } else if (target === 'catalog') {
    control = (
      <NextLink href={CATALOG_PATH} className={styles.backControl} aria-label="Назад" {...events}>
        <ArrowBackIcon />
      </NextLink>
    );
  }
  return <div className={styles.back}>{control}</div>;
}
