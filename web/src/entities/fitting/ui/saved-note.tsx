import NextLink from 'next/link';
import type { AnchorHTMLAttributes } from 'react';

import { CheckIcon, InfoTip } from '@/shared/ui';

import styles from './saved-note.module.scss';

// A tracked element's handlers, from the widget's `useTrackedElement`.
export type SavedNoteEvents = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface SavedNoteProps {
  // The history's address, the page's to give (K7).
  href: string;
  // The result's `result.history`.
  events?: SavedNoteEvents;
  // A remark about the result, the hint of an «!» after the line (spec 0024 AC13).
  note?: string;
  className?: string;
}

// Where a result is kept (spec 0023 P30, Y7): a check mark and «Сохранено в «Мои примерки»», the
// name a link to the history, a line of its own under the result's picture.
export function SavedNote({ href, events, note, className }: SavedNoteProps) {
  return (
    <p className={[styles.note, className].filter(Boolean).join(' ')}>
      <CheckIcon size={16} className={styles.icon} />
      <span>
        Сохранено в{' '}
        <NextLink
          href={href}
          className={styles.link}
          onClick={events?.onClick}
          onPointerEnter={events?.onPointerEnter}
          onPointerLeave={events?.onPointerLeave}
        >
          «Мои примерки»
        </NextLink>
      </span>
      {note && <InfoTip aria-label="Об изображении" content={note} />}
    </p>
  );
}
