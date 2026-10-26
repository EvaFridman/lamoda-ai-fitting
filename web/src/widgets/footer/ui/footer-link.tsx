'use client';

import { useTrackedElement } from '@/shared/analytics';
import { Link } from '@/shared/ui';

import type { FooterItem } from '../config/items';

// A tracked item (spec 0022 X18).
export function FooterLink({
  href,
  label,
  fullLoad,
  track,
  className,
}: Required<Pick<FooterItem, 'href' | 'label' | 'track'>> &
  Pick<FooterItem, 'fullLoad'> & { className?: string }) {
  const tracked = useTrackedElement('footer.link', { link: track });
  return (
    <Link
      href={href}
      fullLoad={fullLoad}
      className={className}
      onClick={tracked.onClick}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      {label}
    </Link>
  );
}
