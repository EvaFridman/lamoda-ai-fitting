import { Spinner } from '@/shared/ui';

import styles from './examples.module.scss';

// Both spinner sizes. With reduced motion turned on in the system the ring stands still.
export function SpinnerSection() {
  return (
    <>
      <p className={styles.caption}>
        Цвет берётся из текста (currentColor). При «уменьшить движение» в системе кольцо не
        вращается.
      </p>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Spinner size={24} />
          <code className={styles.props}>size 24</code>
        </li>
        <li className={styles.example}>
          <Spinner size={64} />
          <code className={styles.props}>size 64</code>
        </li>
      </ul>
    </>
  );
}
