import styles from './count-badge.module.scss';

export interface CountBadgeProps {
  // How many: 0 draws nothing.
  count: number;
  // Past it the badge shows `<max>+` (the results not yet seen: «9+», spec 0024 Z18).
  max?: number;
  className?: string;
}

// A black counter over an icon (board 13: the fitting room's hanger, 0–5 items). The parent places
// it (`className`, positioned against the icon) and says the count in its own accessible name
// ("Примерочная, 3 вещи"), so the badge itself is hidden from screen readers.
export function CountBadge({ count, max, className }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className={[styles.badge, className].filter(Boolean).join(' ')}>
      {max !== undefined && count > max ? `${max}+` : count}
    </span>
  );
}
