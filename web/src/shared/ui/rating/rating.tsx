import { StarIcon } from '../icon/icons';

import styles from './rating.module.scss';

export interface RatingProps {
  // From 0 to 5. A product with no rating passes nothing, and nothing is shown.
  value?: number | null;
  className?: string;
}

// One decimal: "4.7" on screen with a dot, as on Lamoda; "4,7" for a screen reader.
const shown = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const spoken = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Lamoda's read-only rating: a black star and the value, "★ 4.7" (D7s). One image to assistive
// technology, named "Рейтинг 4,7 из 5".
export function Rating({ value, className }: RatingProps) {
  if (value === undefined || value === null) return null;

  return (
    <span
      role="img"
      aria-label={`Рейтинг ${spoken.format(value)} из 5`}
      className={[styles.rating, className].filter(Boolean).join(' ')}
    >
      <StarIcon size={16} />
      <span>{shown.format(value)}</span>
    </span>
  );
}
