import NextLink from 'next/link';
import type { ComponentPropsWithRef } from 'react';

import styles from './link.module.scss';

export type LinkVariant = 'primary' | 'secondary';

export type LinkProps = ComponentPropsWithRef<typeof NextLink> & {
  variant?: LinkVariant;
};

export type LinkButtonProps = ComponentPropsWithRef<'button'> & {
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

// A button that looks like `Link`: an action, not a page ("Удалить аккаунт" opens a modal).
export function LinkButton({ variant = 'primary', className, ...props }: LinkButtonProps) {
  return (
    <button
      type="button"
      className={[styles.link, styles.button, styles[variant], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
