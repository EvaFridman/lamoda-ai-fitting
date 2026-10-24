'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  Button,
  type ButtonSize,
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
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface CartStubButtonProps {
  // «Добавить в корзину», «В корзину».
  children: ReactNode;
  size?: ButtonSize;
  textSize?: 'body-m' | 'body-s';
  className?: string;
  events?: StubEvents;
}

// «Добавить в корзину»: enabled, tracked, and only the toast (A33).
export function CartStubButton({
  children,
  size,
  textSize,
  className,
  events,
}: CartStubButtonProps) {
  return (
    <Button
      size={size}
      textSize={textSize}
      className={className}
      onPointerEnter={events?.onPointerEnter}
      onPointerLeave={events?.onPointerLeave}
      onClick={(event) => {
        events?.onClick?.(event);
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
  // Called on a press, before the toast: the widget's tracked click.
  onPress?: () => void;
}

// «В избранное»: the kit's heart that never stays pressed (A33).
export function FavoriteStub({ size, className, onPress }: FavoriteStubProps) {
  return (
    <FavoriteToggle
      size={size}
      className={className}
      pressed={false}
      onPressedChange={() => {
        onPress?.();
        showStubToast();
      }}
      aria-label="В избранное"
    />
  );
}
