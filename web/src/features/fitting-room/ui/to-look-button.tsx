'use client';

import type { OutfitSlot } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';
import { Button, type ButtonSize, CheckIcon, HangerIcon } from '@/shared/ui';

import { type LookToggleElement, useLookToggle } from '../model/use-look-toggle';

export interface ToLookButtonProps {
  product: Pick<ProductListItem, 'id' | 'name' | 'brand'>;
  slot: OutfitSlot;
  // The colour chosen beside it, put with the product.
  attributeValueId?: string | null;
  // The buy box's or the single result's (spec 0024 Z14).
  element?: Extract<LookToggleElement, 'buy-box.to-look' | 'result.to-look'>;
  onSignIn: () => void;
  // The buy box's 48 by default; the single result's is 32 in small text beside the size (Z49).
  size?: ButtonSize;
  textSize?: 'body-m' | 'body-s';
  className?: string;
}

// «Добавить к образу» of the buy box (board 1, A62, A82.2; spec 0023 P1) and of the single result
// (spec 0024 Z14): an outline button, 48 by default (the result's 32, Z49)
// (spec 0024 Z4) that puts the product into its slot; once it is there, «В образе» with a ✓,
// pressed, and a click takes it out.
export function ToLookButton({
  product,
  slot,
  attributeValueId,
  element,
  onSignIn,
  size = 48,
  textSize,
  className,
}: ToLookButtonProps) {
  const look = useLookToggle({ product, slot, attributeValueId, element, onSignIn });
  return (
    <Button
      size={size}
      textSize={textSize}
      variant="outline"
      className={className}
      aria-pressed={look.pressed}
      loading={look.busy}
      {...look.events}
      onClick={look.toggle}
    >
      {look.pressed ? <CheckIcon /> : <HangerIcon />}
      {look.pressed ? 'В образе' : 'Добавить к образу'}
    </Button>
  );
}
