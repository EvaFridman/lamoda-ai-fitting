import NextLink from 'next/link';
import type { ComponentPropsWithRef } from 'react';

import styles from './link.module.scss';

export type LinkVariant = 'primary' | 'secondary';

export type LinkProps = ComponentPropsWithRef<typeof NextLink> & {
  variant?: LinkVariant;
};

// A text link: black with a grey underline ("Таблица размеров"); `secondary` is grey text.
// next/link, so links inside the site navigate without a full page load.
export function Link({ variant = 'primary', className, ...props }: LinkProps) {
  return (
    <NextLink
      className={[styles.link, styles[variant], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
