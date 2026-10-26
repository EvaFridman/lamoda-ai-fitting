import NextLink from 'next/link';
import type { ComponentPropsWithRef } from 'react';

import styles from './link.module.scss';

export type LinkVariant = 'primary' | 'secondary';

export type LinkProps = (
  | (ComponentPropsWithRef<typeof NextLink> & { fullLoad?: false })
  // A plain <a>: the page loads in full (the stores page's own policy, spec 0022 X16) or is
  // another site's.
  | (ComponentPropsWithRef<'a'> & { href: string; fullLoad: true })
) & {
  variant?: LinkVariant;
};

export type LinkButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: LinkVariant;
};

// A text link: black with a grey underline ("Таблица размеров"); `secondary` is grey text.
// next/link, so links inside the site navigate without a full page load; `fullLoad` is a plain <a>.
export function Link(props: LinkProps) {
  if (props.fullLoad) {
    const { variant = 'primary', className, fullLoad: _fullLoad, children, ...rest } = props;
    return (
      <a className={[styles.link, styles[variant], className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </a>
    );
  }
  const { variant = 'primary', className, fullLoad: _fullLoad, ...rest } = props;
  return (
    <NextLink
      className={[styles.link, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
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
