'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import NextLink from 'next/link';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { Spinner } from '../spinner/spinner';

import styles from './button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'outline';
export type ButtonSize = 32 | 40 | 48 | 56;

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // 'body-s' (13px) is the catalog's small "В корзину"; every other button has 16px text.
  textSize?: 'body-m' | 'body-s';
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export type ButtonAsButtonProps = ButtonLook &
  Omit<ComponentPropsWithRef<'button'>, keyof ButtonLook> & {
    href?: undefined;
    // Shows a Spinner over the label and sets aria-busy. The button ignores clicks but keeps focus
    // while it loads, so a keyboard user does not lose their place. `disabled` wins over it.
    loading?: boolean;
  };

// A link that looks like a button. A link has no disabled or loading state.
export type ButtonAsLinkProps = ButtonLook &
  Omit<ComponentPropsWithRef<typeof NextLink>, keyof ButtonLook> & {
    disabled?: never;
    loading?: never;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function buttonClassName(
  { variant = 'primary', size = 48, textSize = 'body-m', fullWidth = false, className }: ButtonLook,
  state: { disabled?: boolean; loading?: boolean } = {},
) {
  return [
    styles.button,
    styles[variant],
    styles[`size${size}`],
    textSize === 'body-s' && styles.textBodyS,
    fullWidth && styles.fullWidth,
    state.loading ? styles.loading : state.disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

// Lamoda's button: black primary, grey secondary and the outlined one, in four heights. Behaviour
// (disabled, focusable while loading) comes from Base UI's Button. Given `href`, it renders a link
// styled the same way: Base UI says a link must not get button semantics.
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, textSize, fullWidth, className, children, ...link } = props;
    return (
      <NextLink
        className={buttonClassName({ variant, size, textSize, fullWidth, className, children })}
        {...link}
      >
        <span className={styles.label}>{children}</span>
      </NextLink>
    );
  }

  const {
    variant,
    size,
    textSize,
    fullWidth,
    className,
    children,
    disabled = false,
    loading = false,
    href: _href,
    ...button
  } = props;
  const busy = loading && !disabled;
  return (
    <BaseButton
      className={buttonClassName(
        { variant, size, textSize, fullWidth, className, children },
        { disabled, loading: busy },
      )}
      disabled={disabled || busy}
      focusableWhenDisabled={busy}
      aria-busy={busy || undefined}
      {...button}
    >
      <span className={styles.label}>{children}</span>
      {busy ? <Spinner aria-hidden className={styles.spinner} /> : null}
    </BaseButton>
  );
}
