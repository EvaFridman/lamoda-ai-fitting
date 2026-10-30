import { plural } from '@/shared/lib';

// The badge tops at «9+» (spec 0024 Z18).
export const UNSEEN_MAX = 9;

// The badge's value as analytics sends it (Z28): 0–9, and 10 for «9+», a value about the page.
export function unseenBadgeValue(unseen: number): number {
  return Math.min(Math.max(0, unseen), UNSEEN_MAX + 1);
}

// The count in a control's accessible name, since the badge is hidden from screen readers:
// «3 новые примерки», past nine «больше 9 новых примерок».
export function unseenText(unseen: number): string {
  if (unseen > UNSEEN_MAX) return `больше ${UNSEEN_MAX} новых примерок`;
  return `${unseen} ${plural(unseen, ['новая примерка', 'новые примерки', 'новых примерок'])}`;
}

// «Профиль, 3 новые примерки»; the bare name with nothing unseen.
export function withUnseen(name: string, unseen: number): string {
  return unseen > 0 ? `${name}, ${unseenText(unseen)}` : name;
}
