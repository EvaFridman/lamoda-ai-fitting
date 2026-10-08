import styles from './skeleton.module.scss';

// A number is in pixels; a string is any CSS length ("100%").
type Length = number | string;

export interface SkeletonProps {
  // 100% of the parent by default.
  width?: Length;
  height: Length;
  // 0 by default; Lamoda rounds a few, such as an avatar ("50%").
  radius?: Length;
  className?: string;
}

// Lamoda's skeleton box: a grey placeholder for what is still loading, pulsing to a darker grey
// and back every 1.4s; no pulse under prefers-reduced-motion. Screen readers skip it: the block
// that loads marks itself `aria-busy` (D7af).
export function Skeleton({ width = '100%', height, radius = 0, className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
