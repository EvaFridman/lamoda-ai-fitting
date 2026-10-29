'use client';

import type { OutfitSlot } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';
import { Button, CheckIcon, HangerIcon } from '@/shared/ui';

import { type LookToggleElement, useLookToggle } from '../model/use-look-toggle';

export interface ToLookButtonProps {
  product: Pick<ProductListItem, 'id' | 'name' | 'brand'>;
  slot: OutfitSlot;
  // The colour chosen beside it, put with the product.
  attributeValueId?: string | null;
  // The buy box's; none for the result's tile, which draws its own button (A90.11).
  element?: Extract<LookToggleElement, 'buy-box.to-look'>;
  onSignIn: () => void;
  className?: string;
}

// «Добавить к образу» of the buy box (board 1, A62, A82.2; spec 0023 P1): an outline 48 button
// (spec 0024 Z4) that puts the product into its slot; once it is there, «В образе» with a ✓,
// pressed, and a click takes it out.
export function ToLookButton({
  product,
  slot,
  attributeValueId,
  element,
  onSignIn,
  className,
}: ToLookButtonProps) {
  const look = useLookToggle({ product, slot, attributeValueId, element, onSignIn });
  return (
    <Button
      size={48}
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
