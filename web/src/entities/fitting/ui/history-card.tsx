'use client';

import Image from 'next/image';
import { type PointerEvent, type ReactNode, useId } from 'react';

import { Spinner } from '@/shared/ui';

import { historyDate } from '../lib/dates';
import { type Fitting, isFittingRunning } from '../model/schemas';
import { ItemsStrip } from './items-strip';

import styles from './history-card.module.scss';

// The tracked element's handlers of the picture's «Открыть», from the page's `useTrackedElement`.
export interface HistoryCardEvents {
  onClick?: () => void;
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerLeave?: () => void;
}

export interface HistoryCardProps {
  fitting: Pick<Fitting, 'kind' | 'parentId' | 'status' | 'items' | 'resultUrl' | 'createdAt'>;
  // Opens the fitting: its result, its wait or its error.
  onOpen: () => void;
  openEvents?: HistoryCardEvents;
  // The page's actions over the picture's bottom right corner (the «⋯» menu).
  actions?: ReactNode;
  // The clock «Сегодня» is counted from; now by default.
  now?: number;
}

// «Рубашка Annen · белый»: one item and its colour.
export function itemLabel(item: Pick<Fitting['items'][number], 'name' | 'colour'>): string {
  return item.colour ? `${item.name} · ${item.colour}` : item.name;
}

// Board 9's kind badge: «Перегенерация» for a regeneration, «Образ» for a look, none for one item.
export function kindBadge(fitting: Pick<Fitting, 'kind' | 'parentId'>): string | null {
  if (fitting.parentId !== null) return 'Перегенерация';
  return fitting.kind === 'look' ? 'Образ' : null;
}

// Board 9's HistoryCard (spec 0019 A62, A78): the result at 3:4 with the small «ИИ» badge (a
// running fitting shows «Готовим примерку…», a failed one «Не получилось»), the items' strip with
// «+N», the kind badge or the item and its colour, and the date. The picture is a button that opens
// the fitting; the result is personal data, so its link is only the image's `src` inside an
// `mp-block` container (A37), and nothing of it goes into an attribute.
export function HistoryCard({ fitting, onOpen, openEvents, actions, now }: HistoryCardProps) {
  const captionId = useId();
  const running = isFittingRunning(fitting);
  const badge = kindBadge(fitting);
  const single = fitting.kind === 'single' ? fitting.items[0] : undefined;

  let picture: ReactNode = null;
  if (running) {
    picture = (
      <span className={styles.state}>
        <Spinner label="" aria-hidden />
        Готовим примерку…
      </span>
    );
  } else if (fitting.status === 'failed') {
    picture = <span className={styles.state}>Не получилось</span>;
  } else if (fitting.resultUrl) {
    picture = (
      <>
        {/* `unoptimized`: Next's optimizer would fetch the signed link itself. */}
        <Image
          className={styles.image}
          src={fitting.resultUrl}
          alt=""
          fill
          sizes="25vw"
          unoptimized
        />
        <span className={styles.ai}>ИИ</span>
      </>
    );
  }

  return (
    <article className={styles.card}>
      <div className={['mp-block', styles.frame].join(' ')}>
        <button
          type="button"
          className={styles.open}
          aria-label="Открыть примерку"
          aria-describedby={captionId}
          onClick={() => {
            openEvents?.onClick?.();
            onOpen();
          }}
          onPointerEnter={openEvents?.onPointerEnter}
          onPointerLeave={openEvents?.onPointerLeave}
        >
          {picture}
        </button>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div id={captionId} className={styles.caption}>
        <div className={[styles.meta, single && styles.singleMeta].filter(Boolean).join(' ')}>
          <ItemsStrip items={fitting.items} className={styles.strip} />
          {single && <span className={styles.label}>{itemLabel(single)}</span>}
          {badge && <span className={styles.kind}>{badge}</span>}
        </div>
        <p className={styles.date}>{historyDate(fitting.createdAt, now)}</p>
      </div>
    </article>
  );
}
