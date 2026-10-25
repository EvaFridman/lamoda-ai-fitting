'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  Button,
  type ButtonSize,
  type ButtonVariant,
  FavoriteToggle,
  type FavoriteToggleSize,
  showToast,
} from '@/shared/ui';

// The cart and the favourites are not in the prototype (spec 0019 A33): their buttons answer this.
export function showStubToast(): void {
  showToast({ title: 'В прототипе нет корзины и избранного' });
}

// A tracked element's handlers, from the widget's `useTrackedElement`.
export type StubEvents = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onPointerEnter' | 'onPointerLeave'
> & { onClick?: () => void };

export interface CartStubButtonProps {
  // «Добавить в корзину», «В корзину», «Всё в корзину».
  children: ReactNode;
  size?: ButtonSize;
  // `outline`: the fitting room's «Всё в корзину» (board 2).
  variant?: ButtonVariant;
  textSize?: 'body-m' | 'body-s';
  className?: string;
  events?: StubEvents;
}

// «Добавить в корзину»: enabled, tracked, and only the toast (A33).
export function CartStubButton({
  children,
  size,
  variant,
  textSize,
  className,
  events,
}: CartStubButtonProps) {
  return (
    <Button
      size={size}
      variant={variant}
      textSize={textSize}
      className={className}
      onPointerEnter={events?.onPointerEnter}
      onPointerLeave={events?.onPointerLeave}
      onClick={() => {
        events?.onClick?.();
        showStubToast();
      }}
    >
      {children}
    </Button>
  );
}

export interface FavoriteStubProps {
  size?: FavoriteToggleSize;
  className?: string;
  // The click is called on a press, before the toast (A84.4).
  events?: StubEvents;
}

// «В избранное»: the kit's heart that never stays pressed (A33).
export function FavoriteStub({ size, className, events }: FavoriteStubProps) {
  return (
    <FavoriteToggle
      size={size}
      className={className}
      pressed={false}
      onPointerEnter={events?.onPointerEnter}
      onPointerLeave={events?.onPointerLeave}
      onPressedChange={() => {
        events?.onClick?.();
        showStubToast();
      }}
      aria-label="В избранное"
    />
  );
}
