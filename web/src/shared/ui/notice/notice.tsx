import type { ReactNode } from 'react';

import { CheckIcon, InfoIcon } from '../icon/icons';

import styles from './notice.module.scss';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NoticeProps {
  // A bold first line.
  title?: string;
  children: ReactNode;
  // `info` grey, `success` green, `warning` orange, `error` red: the bar and the icon.
  tone?: NoticeTone;
  // `status` or `alert` makes a screen reader announce a notice that appears after the page loaded
  // (a refused photo); a notice that is there from the start needs none.
  role?: 'status' | 'alert';
  className?: string;
}

// A message inside the page's flow, not over it as a toast: a hint before an upload, a refusal, a
// limit reached. A grey box with a coloured bar on its left and the tone's icon.
export function Notice({ title, children, tone = 'info', role, className }: NoticeProps) {
  const Icon = tone === 'success' ? CheckIcon : InfoIcon;
  return (
    <div className={[styles.notice, styles[tone], className].filter(Boolean).join(' ')} role={role}>
      <Icon className={styles.icon} />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        <div className={styles.text}>{children}</div>
      </div>
    </div>
  );
}
