'use client';

import type { OutfitSlot } from '@/entities/fitting-room';
import { LookToggle, type ProductListItem } from '@/entities/product';

import { type LookToggleElement, useLookToggle } from '../model/use-look-toggle';

export interface RoomLookToggleProps {
  product: Pick<ProductListItem, 'id' | 'name' | 'brand'>;
  slot: OutfitSlot;
  element: Extract<LookToggleElement, 'catalog.to-look' | 'related.to-look'>;
  // A visitor's click: the card's placer opens its one sign-in window (A12).
  onSignIn: () => void;
}

// A card's hanger made live (spec 0019 A90.1): black while the product is in the room; a click puts
// it into its slot or takes it out, with board 2's toasts.
export function RoomLookToggle({ product, slot, element, onSignIn }: RoomLookToggleProps) {
  const look = useLookToggle({ product, slot, element, onSignIn });
  return (
    <LookToggle
      pressed={look.pressed}
      busy={look.busy}
      onPressedChange={look.toggle}
      events={look.events}
    />
  );
}
