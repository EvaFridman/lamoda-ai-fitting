import styles from './badges.module.scss';

export type BadgeTone = 'discount' | 'club' | 'premium' | 'promo';

export type BadgeSize = 's' | 'l';

export interface Badge {
  tone: BadgeTone;
  // The badge's text: "−40%", "−7% club", "premium", "до 25%".
  label: string;
}

export interface BadgesProps {
  badges: Badge[];
  // `s`: 16px high, 11px text (catalog). `l`: 24px high, 16px text (product page).
  size?: BadgeSize;
  className?: string;
}

// Lamoda's skewed labels on a product photo and next to a price. A row of badges is one skewed
// strip, 1px between the badges, cut straight on the left: a single badge is a row of one.
export function Badges({ badges, size = 's', className }: BadgesProps) {
  return (
    <span className={[styles.badges, styles[size], className].filter(Boolean).join(' ')}>
      <span className={styles.strip}>
        {badges.map((badge) => (
          <span
            key={`${badge.tone} ${badge.label}`}
            className={[styles.badge, styles[badge.tone]].join(' ')}
          >
            <span className={styles.text}>{badge.label}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
