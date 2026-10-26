import styles from './soon-chip.module.scss';

export interface SoonChipProps {
  className?: string;
}

// Board 3's «скоро» on a feature that is not ready yet (spec 0023 C4, C5: the header's favourites
// and cart). The parent places it (`className`, positioned against its control) and keeps its own
// accessible name ("Избранное"), so the chip itself is hidden from screen readers, as CountBadge.
export function SoonChip({ className }: SoonChipProps) {
  return (
    <span aria-hidden="true" className={[styles.chip, className].filter(Boolean).join(' ')}>
      скоро
    </span>
  );
}
