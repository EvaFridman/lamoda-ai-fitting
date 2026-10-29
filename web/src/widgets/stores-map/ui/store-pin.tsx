import { LAMODA_MARK_HEIGHT, LAMODA_MARK_WIDTH, LamodaMark } from '@/shared/ui';

import styles from './stores-map.module.scss';

// Lamoda's map pin (spec 0022 X5, X9): a black drop whose tip is the store's point, the kit's «la»
// in white on its round part. Decorative: the marker's button names the store.
export function StorePin() {
  return (
    <svg className={styles.pinIcon} viewBox="0 0 32 40" aria-hidden="true" focusable="false">
      <path d="M16 40 4.07 26.67A16 16 0 1 1 27.93 26.67Z" fill="currentColor" />
      <LamodaMark
        x={5.95}
        y={8}
        width={LAMODA_MARK_WIDTH}
        height={LAMODA_MARK_HEIGHT}
        fill="#fff"
      />
    </svg>
  );
}
