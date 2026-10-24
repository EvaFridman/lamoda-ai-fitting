import { CountBadge, HangerIcon, ProgressBar } from '@/shared/ui';

import styles from './examples.module.scss';

const progress = [0, 64, 100];
const counts = [0, 3, 5];

// The bar of the fitting's wait (board 6) and the counter over the fitting room's icon (board 13).
export function ProgressSection() {
  return (
    <>
      <p className={styles.caption}>
        Полоска показывает, сколько готово; подпись и проценты стоят рядом с ней на странице.
        Счётчик ставится поверх иконки, при 0 его нет.
      </p>

      <h3 className={styles.heading}>ProgressBar</h3>
      <ul className={styles.row}>
        {progress.map((value) => (
          <li key={value} className={`${styles.example} ${styles.wide}`}>
            <ProgressBar value={value} aria-label="Примерка" />
            <code className={styles.props}>value {value}</code>
          </li>
        ))}
      </ul>

      <h3 className={styles.heading}>CountBadge</h3>
      <ul className={styles.row}>
        {counts.map((count) => (
          <li key={count} className={styles.example}>
            <span className={styles.badgeAnchor}>
              <HangerIcon />
              <CountBadge count={count} className={styles.badgeCorner} />
            </span>
            <code className={styles.props}>count {count}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
