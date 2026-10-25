'use client';

import { FittingRoomButton, openRoom, useFittingRoom } from '@/entities/fitting-room';
import { useSession } from '@/entities/session';
import { LoginModal } from '@/features/auth';
import { useTrackedElement } from '@/shared/analytics';

import styles from './header.module.scss';

// The header's «Примерочная» (spec 0019 A10, A12, AC13): the hanger with the room's count on every
// page and width, between «Избранное» and «Корзина»; it opens the room's drawer (mounted by the
// root layout). A visitor has no room: the icon opens the sign-in window. Inert while the session
// loads.
export function HeaderRoom() {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const room = useFittingRoom(signedIn);
  const count = room.data?.count ?? 0;
  const tracked = useTrackedElement('room.open', { source: 'header', items: count });

  if (session.status === 'pending') {
    return <FittingRoomButton count={0} aria-disabled="true" className={styles.iconButton} />;
  }
  if (!signedIn) {
    return (
      <LoginModal
        handlesReturnedError={false}
        trigger={<FittingRoomButton count={0} className={styles.iconButton} />}
      />
    );
  }
  return (
    <FittingRoomButton
      count={count}
      className={styles.iconButton}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
      onClick={() => {
        tracked.onClick();
        openRoom();
      }}
    />
  );
}
