import { BagIcon, HeartIcon, IconButton, SoonChip } from '@/shared/ui';

import styles from './examples.module.scss';

// Board 3's «скоро» (spec 0023 C4, C5): alone, and over the header's inert icons.
export function SoonSection() {
  return (
    <>
      <p className={styles.caption}>
        Чип «скоро» стоит на функции, которой ещё нет. Его ставит родитель, а имя элемента остаётся
        своим: «Избранное», «Корзина».
      </p>
      <ul className={styles.row}>
        <li className={styles.example}>
          <SoonChip />
          <code className={styles.props}>SoonChip</code>
        </li>
        <li className={styles.example}>
          <IconButton
            aria-label="Избранное"
            aria-disabled="true"
            variant="plain"
            className={styles.soonButton}
          >
            <HeartIcon />
            <SoonChip className={styles.soonCorner} />
          </IconButton>
          <code className={styles.props}>на иконке шапки</code>
        </li>
        <li className={styles.example}>
          <IconButton
            aria-label="Корзина"
            aria-disabled="true"
            variant="plain"
            className={styles.soonButton}
          >
            <BagIcon />
            <SoonChip className={styles.soonCorner} />
          </IconButton>
          <code className={styles.props}>на иконке шапки</code>
        </li>
      </ul>
    </>
  );
}
