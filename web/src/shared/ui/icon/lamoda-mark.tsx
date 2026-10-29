import type { SVGProps } from 'react';

// Lamoda's «la»: the first two letters of the «lamoda sport» wordmark (`_pages/stores/ui/logos.tsx`),
// in the stores map's pin (spec 0022 X5) and the tab icons (spec 0024 Z5). `app/icon.svg` is a
// static file and repeats these paths (`lamoda-mark.test.tsx` keeps the two the same).
export const LAMODA_MARK_WIDTH = 20.1055;
export const LAMODA_MARK_HEIGHT = 16;
export const LAMODA_MARK_PATHS = [
  'M3.2666 15.6406H0V0H3.2666V15.6406Z',
  'M12.5137 2.9043C14.4996 2.90443 16.045 3.73147 16.8174 5.00488H16.8838V3.2627H20.1055V15.6406H16.8838V13.8984H16.8174C16.0449 15.1717 14.4994 15.9979 12.5137 15.998C8.7622 15.9979 6.40049 13.2941 6.40039 9.45117C6.40052 5.6083 8.76223 2.90446 12.5137 2.9043ZM13.3301 5.58594C10.6818 5.58595 9.73242 6.81459 9.73242 9.45117C9.73248 12.0876 10.6819 13.3164 13.3301 13.3164C15.9779 13.3163 16.9277 12.0874 16.9277 9.45117C16.9277 6.81475 15.978 5.58609 13.3301 5.58594Z',
] as const;

export type LamodaMarkProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

// Decorative and painted with currentColor unless `fill` says otherwise; its placer sizes it
// (`width`, `height`, and `x`, `y` inside another svg).
export function LamodaMark(props: LamodaMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LAMODA_MARK_WIDTH} ${LAMODA_MARK_HEIGHT}`}
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {LAMODA_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
