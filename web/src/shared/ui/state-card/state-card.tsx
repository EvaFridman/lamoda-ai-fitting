import type { ReactNode } from 'react';

import styles from './state-card.module.scss';

export interface StateCardProps {
  // A kit icon at 24px; it sits in a white circle above the title.
  icon?: ReactNode;
  title: string;
  // The title's level in the page's outline.
  titleAs?: 'h2' | 'h3' | 'h4';
  // The explanation under the title.
  children?: ReactNode;
  // Buttons or links, one under the other on a phone.
  actions?: ReactNode;
  className?: string;
}

// A whole block's state in place of its content: nothing yet ("Здесь появятся ваши фото"), a
// refusal with what to do next, a failed load with "Повторить". Centred, on the secondary
// background.
export function StateCard({
  icon,
  title,
  titleAs: Title = 'h2',
  children,
  actions,
  className,
}: StateCardProps) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <Title className={styles.title}>{title}</Title>
      {children ? <div className={styles.text}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
