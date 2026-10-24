import Image from 'next/image';
import NextLink from 'next/link';
import type { AnchorHTMLAttributes } from 'react';

import { ChevronLeftIcon } from '@/shared/ui';

import { historyDate } from '../lib/dates';
import type { Fitting } from '../model/schemas';

import styles from './tried-on-note.module.scss';

// A tracked element's handlers, from the widget's `useTrackedElement`.
export type TriedOnNoteEvents = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface TriedOnNoteProps {
  fitting: Pick<Fitting, 'items' | 'resultUrl' | 'createdAt'>;
  // The product of the page: its item in the fitting gives the colour.
  productId: string;
  // Where the note leads: the fitting opened in the try-on window.
  href: string;
  events?: TriedOnNoteEvents;
  now?: number;
  className?: string;
}

// Board 13's TriedOnNote (spec 0019 AC24): the last result's thumbnail, «Вы это примеряли», its
// date and the item's colour, and «Смотреть» (a chevron on phones, board 1.2). The result's signed
// link is only the image's `src` (A37), and the whole note is `mp-block`. `events` is for T22's
// tracked element `buy-box.tried-on` (plan §9).
export function TriedOnNote({
  fitting,
  productId,
  href,
  events,
  now,
  className,
}: TriedOnNoteProps) {
  const colour = fitting.items.find((item) => item.productId === productId)?.colour;
  const caption = [historyDate(fitting.createdAt, now), colour].filter(Boolean).join(' · ');
  return (
    <NextLink
      href={href}
      // The whole note is the user's (the fitting's id in `href`, its date and colour): not recorded.
      className={['mp-block', styles.note, className].filter(Boolean).join(' ')}
      onClick={events?.onClick}
      onPointerEnter={events?.onPointerEnter}
      onPointerLeave={events?.onPointerLeave}
    >
      <span className={['mp-block', styles.thumb].join(' ')}>
        {/* `unoptimized`: Next's optimizer would fetch the signed link itself. */}
        {fitting.resultUrl && (
          <Image src={fitting.resultUrl} alt="" fill sizes="36px" unoptimized />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>Вы это примеряли</span>
        <span className={styles.caption}>{caption}</span>
      </span>
      <span className={styles.see}>Смотреть</span>
      <ChevronLeftIcon size={16} className={styles.chevron} />
    </NextLink>
  );
}
