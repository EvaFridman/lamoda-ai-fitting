import { Link } from '@/shared/ui';

import styles from './examples.module.scss';

// Both link variants, in the 16px and the 13px text they appear in.
export function LinksSection() {
  return (
    <>
      <p className={styles.caption}>
        Наведите курсор / нажмите Tab: наведение и фокус видны вживую.
      </p>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Link href="#links">Таблица размеров</Link>
          <code className={styles.props}>primary</code>
        </li>
        <li className={styles.example}>
          <Link href="#links" variant="secondary">
            Условия возврата
          </Link>
          <code className={styles.props}>secondary</code>
        </li>
        <li className={`${styles.example} ${styles.smallText}`}>
          <Link href="#links">Таблица размеров</Link>
          <code className={styles.props}>primary в тексте 13px</code>
        </li>
        <li className={`${styles.example} ${styles.smallText}`}>
          <Link href="#links" variant="secondary">
            Условия возврата
          </Link>
          <code className={styles.props}>secondary в тексте 13px</code>
        </li>
      </ul>
    </>
  );
}
