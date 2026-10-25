'use client';

import { type FittingRoom, type OutfitSlot, useFittingRoom } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';
import { useSession } from '@/entities/session';
import { useTrackedElement } from '@/shared/analytics';

import { useRoomActions } from './use-room-actions';

// The tracked places of the hanger and «К образу» (A90.9); the result's tile is not tracked (A90.11).
export type LookToggleElement = 'catalog.to-look' | 'related.to-look' | 'buy-box.to-look';

export type LookAction = 'add' | 'replace' | 'remove';

// What a click does, from the room already read: removes the product, fills its empty slot or
// replaces the slot's item.
export function lookAction(
  room: FittingRoom | undefined,
  productId: string,
  slot: OutfitSlot,
): LookAction {
  const items = room?.items ?? [];
  if (items.some((item) => item.product.id === productId)) return 'remove';
  return items.some((item) => item.slot === slot) ? 'replace' : 'add';
}

export interface UseLookToggleOptions {
  product: Pick<ProductListItem, 'id' | 'name' | 'brand'>;
  slot: OutfitSlot;
  // The colour put with it: the buy box's choice; the cards' none.
  attributeValueId?: string | null;
  // Its tracked element; none for the result's tile, which sends nothing.
  element?: LookToggleElement;
  // A visitor's click: the placer opens the sign-in window (A12, AC16).
  onSignIn: () => void;
}

// The hanger of a card, «К образу» of the buy box and the result's tile (spec 0019 AC13): pressed
// while the product is in the room; a click puts it into its slot (replacing the slot's item) or
// takes it out. Off while the session or the room loads, and while a click's write runs.
export function useLookToggle({
  product,
  slot,
  attributeValueId,
  element,
  onSignIn,
}: UseLookToggleOptions) {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const room = useFittingRoom(signedIn);
  const actions = useRoomActions();
  const action = signedIn ? lookAction(room.data, product.id, slot) : 'add';
  // A hook runs on every render: an untracked place takes an element and never sends it. The three
  // places share their properties; the catalog's types check them per element, so one stands in.
  const events = useTrackedElement((element ?? 'buy-box.to-look') as 'buy-box.to-look', {
    slot,
    action,
    signed_in: signedIn,
  });

  const loading = session.status === 'pending' || (signedIn && room.isPending);
  const pressed = action === 'remove';
  const busy = loading || actions.pending;

  function toggle() {
    if (busy) return;
    if (element) events.onClick();
    if (!signedIn) {
      onSignIn();
      return;
    }
    const item = room.data?.items.find((entry) => entry.product.id === product.id);
    if (item) void actions.remove(item);
    else void actions.put({ product, slot, attributeValueId }, 'add');
  }

  return {
    pressed,
    // Waits: no click, but focusable (the placer draws it `aria-disabled`).
    busy,
    // Hovers, for a tracked place; none starts while it waits (the catalog's «ничего не шлёт»),
    // and the leave stays, so one started before is cancelled.
    events: element
      ? {
          onPointerEnter: busy ? undefined : events.onPointerEnter,
          onPointerLeave: events.onPointerLeave,
        }
      : {},
    toggle,
  };
}
