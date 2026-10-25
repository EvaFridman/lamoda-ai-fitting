'use client';

import { LimitMeter, renewalDate, type FittingQuota } from '@/entities/fitting';
import { useFittingRoom } from '@/entities/fitting-room';
import { useTrackedElement } from '@/shared/analytics';
import { PHONE_QUERY } from '@/shared/config';
import { plural, useMediaQuery } from '@/shared/lib';
import { Button, StateCard } from '@/shared/ui';

import styles from './limit-card.module.scss';

export interface LimitCardProps {
  quota: FittingQuota;
  // The history of fittings.
  historyHref: string;
  // «Перейти в примерочную»: the window closes, the room opens (A90.12).
  onOpenRoom: () => void;
}

const CALENDAR = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <rect x="4" y="5" width="16" height="15" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);

// Board 11 (spec 0019 AC19): the month's try-ons are spent; they come back on the first of the next
// month (A26). The history and the fitting room work as usual (A75, A90.7).
export function LimitCard({ quota, historyHref, onOpenRoom }: LimitCardProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const room = useFittingRoom();
  const openEvents = useTrackedElement('room.open', {
    source: 'limit',
    items: room.data?.count ?? 0,
  });
  return (
    <StateCard
      icon={CALENDAR}
      title="Примерки на этот месяц закончились"
      titleAs="h3"
      className={styles.card}
      actions={
        <>
          <Button href={historyHref} fullWidth>
            {phone ? 'История примерок' : 'Открыть историю примерок'}
          </Button>
          <Button
            variant="outline"
            fullWidth
            onPointerEnter={openEvents.onPointerEnter}
            onPointerLeave={openEvents.onPointerLeave}
            onClick={() => {
              openEvents.onClick();
              onOpenRoom();
            }}
          >
            {phone ? 'Примерочная' : 'Перейти в примерочную'}
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        {plural(quota.limit, ['Новая', 'Новые', 'Новые'])} {quota.limit}{' '}
        {plural(quota.limit, ['примерка появится', 'примерки появятся', 'примерок появятся'])}{' '}
        <b>{renewalDate(quota.renewsAt)}</b>.
      </p>
      {phone && (
        <LimitMeter left={0} limit={quota.limit} className={styles.meter}>
          0 из {quota.limit}
        </LimitMeter>
      )}
      <p className={styles.muted}>
        История и примерочная работают как обычно: можно смотреть прошлые результаты и собирать
        образ заранее.
      </p>
    </StateCard>
  );
}
