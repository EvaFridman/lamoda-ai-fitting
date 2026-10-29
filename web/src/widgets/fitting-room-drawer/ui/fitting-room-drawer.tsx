'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useActiveCategories } from '@/entities/category';
import { LimitMeter, useFittingQuota } from '@/entities/fitting';
import {
  clearFocusSlot,
  closeRoom,
  EmptySlotRow,
  type FittingRoom,
  openLookTryOn,
  OUTFIT_SLOTS,
  type OutfitSlot,
  SlotRowSkeleton,
  SLOT_SHORT,
  useFittingRoom,
  useRoomStore,
} from '@/entities/fitting-room';
import { useSession } from '@/entities/session';
import { useRoomActions } from '@/features/fitting-room';
import { CartStubButton } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { formatPrice, plural, useMediaQuery } from '@/shared/lib';
import {
  Button,
  Drawer,
  HangerIcon,
  IconButton,
  LinkButton,
  Menu,
  MenuItem,
  MoreIcon,
  Notice,
  SparkleIcon,
  StateCard,
} from '@/shared/ui';

import { RoomSlot } from './room-slot';
import { RoomWishes } from './room-wishes';

import styles from './fitting-room-drawer.module.scss';

// «Подобрать в каталоге»: the first active category of the slot (A90.8).
function useFillHrefs(): Map<OutfitSlot, string> {
  const categories = useActiveCategories();
  const hrefs = new Map<OutfitSlot, string>();
  for (const category of categories.data?.items ?? []) {
    if (category.slot !== null && !hrefs.has(category.slot)) {
      hrefs.set(category.slot, `/catalog/${encodeURIComponent(category.slug)}`);
    }
  }
  return hrefs;
}

function EmptySlot({ slot, href }: { slot: OutfitSlot; href: string | undefined }) {
  const fill = useTrackedElement('room.fill', { slot });
  return (
    <EmptySlotRow
      slot={slot}
      href={href}
      // The «+» box and «Подобрать в каталоге» alike (spec 0023 P16, Y11.7).
      linkEvents={{
        ...fill,
        onClick: () => {
          fill.onClick();
          closeRoom();
        },
      }}
    />
  );
}

// The five slots in their order. The categories are read only here, for a room with items: a
// visitor's page, or an empty room, asks for none.
// A slot to bring into view (the look result's «Заменить», spec 0024 Z8) scrolls to its row once
// the rows are there, then the store forgets it.
function RoomSlots({ room, phone }: { room: FittingRoom; phone: boolean }) {
  const fillHrefs = useFillHrefs();
  const bySlot = new Map(room.items.map((item) => [item.slot, item]));
  const focusSlot = useRoomStore((state) => state.focusSlot);
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focusSlot === null) return;
    focusRef.current?.scrollIntoView({ block: 'start' });
    clearFocusSlot();
  }, [focusSlot]);
  return (
    <ul className={styles.slots}>
      {OUTFIT_SLOTS.map((slot) => {
        const item = bySlot.get(slot);
        return (
          <li key={slot} ref={slot === focusSlot ? focusRef : undefined}>
            {item ? (
              <RoomSlot item={item} phone={phone} />
            ) : (
              <EmptySlot slot={slot} href={fillHrefs.get(slot)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// «Примерить образ» (T26): the drawer closes and the look's try-on opens, for two items or more
// (a look is 2 to 5, A70.4); busy while the room loads.
function TryOnLook({ count }: { count: number | null }) {
  const tracked = useTrackedElement('room.try-on', { items: count ?? 0 });
  return (
    <Button
      size={48}
      className={styles.grow}
      loading={count === null}
      disabled={count !== null && count < 2}
      onClick={() => {
        tracked.onClick();
        openLookTryOn();
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <SparkleIcon />
      Примерить образ
    </Button>
  );
}

// Board 2.3: «В примерочной пока пусто» (on a phone «Пока пусто» with the five dashed cells).
function EmptyRoom({ phone }: { phone: boolean }) {
  return (
    <StateCard
      icon={<HangerIcon />}
      title={phone ? 'Пока пусто' : 'В примерочной пока пусто'}
      titleAs="h3"
      className={styles.empty}
      actions={
        <>
          <Button
            href="/catalog"
            variant={phone ? 'outline' : 'primary'}
            fullWidth={phone}
            onClick={closeRoom}
          >
            Перейти в каталог
          </Button>
          <Button disabled fullWidth={phone}>
            Примерить образ
          </Button>
        </>
      }
    >
      <p className={styles.muted}>
        {phone
          ? 'Добавляйте вещи кнопкой «Добавить к образу» — до пяти вещей: верхний слой и платья, нижний слой, верхняя одежда, обувь и аксессуары.'
          : 'Нажмите «Добавить к образу» на товаре — вещи соберутся здесь, и вы примерите их вместе за одну примерку.'}
      </p>
      {phone && (
        <ul className={styles.cells} aria-hidden>
          {OUTFIT_SLOTS.map((slot) => (
            <li key={slot}>{SLOT_SHORT[slot]}</li>
          ))}
        </ul>
      )}
    </StateCard>
  );
}

interface FooterProps {
  room: FittingRoom;
  phone: boolean;
}

// Board 2's footer: the look's sum, «Примерить образ» and «Добавить образ в корзину» (A33, spec
// 0023 P21), then the month's
// meter and «Очистить примерочную» (on a phone it is in «…», A90.4).
function RoomFooter({ room, phone }: FooterProps) {
  const quota = useFittingQuota();
  const actions = useRoomActions();
  const cartAll = useTrackedElement('room.add-to-cart-all', { items: room.count });
  const clear = useTrackedElement('room.clear', { items: room.count });
  return (
    <div className={styles.footer}>
      <p className={styles.sum}>
        <span>
          {phone
            ? `Сумма образа · ${room.count} ${plural(room.count, ['вещь', 'вещи', 'вещей'])}`
            : 'Сумма образа'}
        </span>
        <b>{formatPrice(room.sum)}</b>
      </p>
      <div className={[styles.buttons, styles.footerButtons].join(' ')}>
        <TryOnLook count={room.count} />
        <CartStubButton size={48} variant="outline" className={styles.grow} events={cartAll}>
          Добавить образ в корзину
        </CartStubButton>
      </div>
      {/* Why «Примерить образ» is off with one item (A92.4). */}
      {room.count < 2 && <p className={styles.muted}>Добавьте ещё вещь — образ от двух</p>}
      {!phone && (
        <div className={styles.meterRow}>
          {quota.data ? <LimitMeter left={quota.data.left} limit={quota.data.limit} /> : <span />}
          <LinkButton
            variant="secondary"
            className={styles.clear}
            disabled={actions.pending}
            onPointerEnter={clear.onPointerEnter}
            onPointerLeave={clear.onPointerLeave}
            onClick={() => {
              clear.onClick();
              void actions.clear();
            }}
          >
            Очистить примерочную
          </LinkButton>
        </div>
      )}
    </div>
  );
}

// The phone's «…» (A90.4): «Очистить примерочную».
function RoomMenu({ room }: { room: FittingRoom | undefined }) {
  const actions = useRoomActions();
  const clear = useTrackedElement('room.clear', { items: room?.count ?? 0 });
  return (
    <Menu
      align="end"
      trigger={
        <IconButton aria-label="Ещё" variant="plain" size={44}>
          <MoreIcon />
        </IconButton>
      }
    >
      <MenuItem
        disabled={!room || room.count === 0 || actions.pending}
        onClick={() => {
          clear.onClick();
          void actions.clear();
        }}
      >
        Очистить примерочную
      </MenuItem>
    </Menu>
  );
}

// The fitting room (spec 0019 board 2, AC13, A62, A90): one per account, read in the browser
// (A12). A side drawer from the right on every width, the whole window on a phone with its own
// «‹ Примерочная …» (A90.4): the five slots in their order (filled ones with the colour, the size
// stub and the item's actions; empty ones with «Подобрать в каталоге»), the wishes, then the
// footer, with no counter line (spec 0023 P13). Mounted once in the root layout and opened through the room's store,
// for a signed-in user only; a new page closes it (its links lead away).
export function FittingRoomDrawer() {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const open = useRoomStore((state) => state.open);
  const setOpen = useRoomStore((state) => state.setOpen);
  const phone = useMediaQuery(PHONE_QUERY);
  const room = useFittingRoom(user !== null);
  const pathname = usePathname();
  const shownPathRef = useRef(pathname);

  useEffect(() => {
    if (shownPathRef.current === pathname) return;
    shownPathRef.current = pathname;
    setOpen(false);
  }, [pathname, setOpen]);

  // Nobody's room is shown signed out (A12): an end of the session closes it and forgets the
  // wishes. The store learns who is signed in, so a write or a toast of the previous user's does
  // not reach the next one.
  const setUser = useRoomStore((state) => state.setUser);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (session.status === 'pending') return;
    setUser(userId);
    if (session.status === 'signed-out') setOpen(false);
  }, [session.status, userId, setUser, setOpen]);

  if (user === null) return null;

  const data = room.data;
  let content;
  if (room.isPending) {
    content = (
      <>
        <p className={styles.subtitle}>Загружаем вещи…</p>
        {[0, 1, 2].map((index) => (
          <SlotRowSkeleton key={index} />
        ))}
      </>
    );
  } else if (data === undefined) {
    content = (
      <div className={styles.failed}>
        <Notice tone="error" role="alert">
          {errorText(room.error)}
        </Notice>
        <Button variant="outline" onClick={() => void room.refetch()}>
          Повторить
        </Button>
      </div>
    );
  } else if (data.count === 0) {
    content = <EmptyRoom phone={phone} />;
  } else {
    content = (
      <>
        <RoomSlots room={data} phone={phone} />
        <RoomWishes userId={user.id} phone={phone} />
      </>
    );
  }

  let footer;
  if (room.isPending) {
    footer = (
      <div className={styles.buttons}>
        <TryOnLook count={null} />
      </div>
    );
  } else if (data && data.count > 0) {
    footer = <RoomFooter room={data} phone={phone} />;
  }

  return (
    <Drawer
      title="Примерочная"
      wide
      open={open}
      onOpenChange={(next) => setOpen(next)}
      closable={!phone}
      onBack={phone ? () => setOpen(false) : undefined}
      backLabel="Закрыть примерочную"
      headerAction={phone ? <RoomMenu room={data} /> : undefined}
      footer={footer}
    >
      {content}
    </Drawer>
  );
}
