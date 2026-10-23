'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import styles from './icon-button.module.scss';

export type IconButtonSize = 44 | 48 | 56;
export type IconButtonVariant = 'outline' | 'plain';

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'aria-label' | 'children' | 'className'
> {
  // Required: the button shows only an icon, so this is its accessible name.
  'aria-label': string;
  size?: IconButtonSize;
  // `plain`: the icon alone, no frame, as the header's icons and board 10's bin (spec 0019).
  variant?: IconButtonVariant;
  className?: string;
  // An icon from @/shared/ui at size 24; it takes the button's colour.
  children: ReactNode;
}

// A square outlined button with one icon, like the favourite button next to "Добавить в корзину".
export function IconButton({
  size = 48,
  variant = 'outline',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <BaseButton
      className={[
        styles.iconButton,
        styles[`size${size}`],
        variant === 'plain' && styles.plain,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </BaseButton>
  );
}
