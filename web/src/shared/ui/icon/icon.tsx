import type { ReactNode, SVGProps } from 'react';

import styles from './icon.module.scss';

export type IconSize = 16 | 24;

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'width' | 'height' | 'viewBox'
> {
  size?: IconSize;
  // Given to an icon that stands alone, with no text next to it: it becomes the icon's accessible
  // name. Without it the icon is decorative and hidden from assistive technology.
  title?: string;
}

// The drawings of one icon by the size they were drawn at. Most icons have both; an icon with one
// drawing is scaled to the other size by its viewBox.
type IconArt = Partial<Record<IconSize, ReactNode>>;

export function createIcon(displayName: string, art: IconArt) {
  function Icon({ size = 24, title, className, ...props }: IconProps) {
    const drawnAt: IconSize = art[size] === undefined ? (size === 16 ? 24 : 16) : size;
    const label = title
      ? ({ role: 'img', 'aria-label': title } as const)
      : ({ 'aria-hidden': true, focusable: false } as const);

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={`0 0 ${drawnAt} ${drawnAt}`}
        fill="none"
        className={className ? `${styles.icon} ${className}` : styles.icon}
        {...label}
        {...props}
      >
        {title ? <title>{title}</title> : null}
        {art[drawnAt]}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
