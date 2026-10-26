'use client';

import { type HTMLAttributes, type MouseEvent, useId } from 'react';

import { ChevronRightIcon, ClockIcon, Link, PhoneIcon } from '@/shared/ui';

import { routeHref, storeAddress, telHref } from '../lib/links';
import type { Store } from '../model/schemas';

import styles from './store-card.module.scss';

// One tracked element's click and pointer handlers, from the page's `useTrackedElement`.
export type StoreCardElementEvents = Pick<
  HTMLAttributes<HTMLElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

// The card's tracked elements (spec 0022 X17): the main area, «›», a phone, the route.
export interface StoreCardEvents {
  card?: StoreCardElementEvents;
  details?: StoreCardElementEvents;
  phone?: StoreCardElementEvents;
  route?: StoreCardElementEvents;
}

export interface StoreCardProps {
  store: Store;
  // The store marked on the map (X5).
  selected: boolean;
  // Its details open (X8).
  expanded: boolean;
  onSelect: () => void;
  onExpandedChange: (expanded: boolean) => void;
  events?: StoreCardEvents;
}

// Calls the card's own handler, then the tracked element's.
function both(own: () => void, tracked?: (event: MouseEvent<HTMLElement>) => void) {
  return (event: MouseEvent<HTMLElement>) => {
    own();
    tracked?.(event);
  };
}

// A store of the stores page (spec 0022 X8, X20, plan §3.1): the name, the address, the metro
// stations and the hours, a line left out when its data is empty. The main area is a button that
// selects the store; «›» opens the description, the phones as `tel:` links and «Проложить
// маршрут», Yandex Maps' route in a new tab. It only displays: the page owns the choice and the
// open card. A store's data is not personal, so no `mp-block`.
export function StoreCard({
  store,
  selected,
  expanded,
  onSelect,
  onExpandedChange,
  events,
}: StoreCardProps) {
  const detailsId = useId();
  const metro = store.metroStations.join(', ');

  return (
    <article className={styles.card} data-selected={selected || undefined}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.main}
          aria-pressed={selected}
          {...events?.card}
          onClick={both(onSelect, events?.card?.onClick)}
        >
          <span className={styles.name}>{store.name}</span>
          <span className={styles.line}>{storeAddress(store)}</span>
          {metro && <span className={styles.line}>м. {metro}</span>}
          {store.workTime && (
            <span className={styles.secondary}>
              <ClockIcon size={16} className={styles.icon} />
              {store.workTime}
            </span>
          )}
        </button>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          aria-label={`Подробнее о магазине «${store.name}»`}
          {...events?.details}
          onClick={both(() => onExpandedChange(!expanded), events?.details?.onClick)}
        >
          <ChevronRightIcon className={styles.chevron} />
        </button>
      </div>
      {expanded && (
        <div id={detailsId} className={styles.details}>
          {store.description && <p className={styles.description}>{store.description}</p>}
          {store.phones.length > 0 && (
            <ul className={styles.phones}>
              {store.phones.map((phone) => (
                <li key={phone}>
                  <PhoneIcon size={16} className={styles.icon} />
                  <Link href={telHref(phone)} {...events?.phone}>
                    {phone}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={routeHref(store)} target="_blank" rel="noopener" {...events?.route}>
            Проложить маршрут
          </Link>
        </div>
      )}
    </article>
  );
}
