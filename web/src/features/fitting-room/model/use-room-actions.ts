'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  clearRoom,
  EMPTY_ROOM,
  type FittingRoom,
  fittingRoomKeys,
  type FittingRoomItem,
  isRoomOwner,
  openRoom,
  type OutfitSlot,
  putRoomItem,
  removeRoomItem,
  roomItemName,
  SLOT_ACCUSATIVE,
  SLOT_TITLES,
  withoutSlot,
} from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';
import { useSession } from '@/entities/session';
import { trackElementClick } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { showToast } from '@/shared/ui';

// What a put says when it is done (A62, A90.10): `add` — «… в примерочной: <слот>» with
// «Открыть», or the replace toast with «Вернуть»; `silent` — nothing (a colour change, a
// «Вернуть»).
export type PutAnnounce = 'add' | 'silent';

export interface PutRequest {
  product: Pick<ProductListItem, 'id' | 'name' | 'brand'>;
  slot: OutfitSlot;
  // The colour, one of the product's values; none left out.
  attributeValueId?: string | null;
}

// «Рубашка Annen» in quotes: Russian cannot inflect a product's name (A90.10).
function quoted(product: Pick<ProductListItem, 'name' | 'brand'>): string {
  return `«${roomItemName(product)}»`;
}

function failed(failure: unknown): void {
  showToast({ title: errorText(failure), tone: 'error' });
  reportFailure(failure);
}

// The fitting room's writes (spec 0019 AC13, A86): put or replace an item, remove one, empty the
// room, each answered in the cache (no read after it), with board 2's toasts. Writes are
// mutations with no retry and nothing kept (`gcTime: 0`), as the account's (spec 0017 plan §4).
// A failure shows its text in a toast and is reported. Everything is the user's who started it: an
// answer that arrives after another user signed in at the tab is not put into their cache (the room
// is read again), and a toast's action does nothing for them (spec 0017 U22).
export function useRoomActions() {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.user.id : null;

  // The answer of `owner`'s write, into the cache only while `owner` is still the one signed in.
  function setRoom(owner: string | null, room: (current: FittingRoom) => FittingRoom) {
    if (!isRoomOwner(owner)) {
      void queryClient.invalidateQueries({ queryKey: fittingRoomKeys.all });
      return;
    }
    const current = queryClient.getQueryData<FittingRoom>(fittingRoomKeys.all) ?? EMPTY_ROOM;
    queryClient.setQueryData(fittingRoomKeys.all, room(current));
  }

  // A toast's action, for the user it was shown to only. The toast outlives this hook's component
  // (a removed row), so the check reads the room's store, not this render.
  function own(owner: string | null, action: () => void): () => void {
    return () => {
      if (isRoomOwner(owner)) action();
    };
  }

  // A read in flight (a tab's return to focus) may have read the room before the write and answer
  // after it, over the write's answer: it is cancelled first.
  const cancelReads = () => queryClient.cancelQueries({ queryKey: fittingRoomKeys.all });

  const putMutation = useMutation({
    mutationFn: ({ slot, product, attributeValueId }: PutRequest) =>
      putRoomItem(
        slot,
        attributeValueId ? { productId: product.id, attributeValueId } : { productId: product.id },
      ),
    onMutate: cancelReads,
    retry: false,
    gcTime: 0,
  });
  const removeMutation = useMutation({
    mutationFn: (item: FittingRoomItem) => removeRoomItem(item.slot),
    onMutate: cancelReads,
    retry: false,
    gcTime: 0,
  });
  const clearMutation = useMutation({
    mutationFn: clearRoom,
    onMutate: cancelReads,
    retry: false,
    gcTime: 0,
  });

  // «Вернуть»: the item back, with its colour, and no toast of its own.
  function undo(item: FittingRoomItem, action: 'replace' | 'remove') {
    trackElementClick('room.undo', { slot: item.slot, action });
    void put(
      { product: item.product, slot: item.slot, attributeValueId: item.attributeValueId },
      'silent',
    );
  }

  async function put(request: PutRequest, announce: PutAnnounce = 'add'): Promise<boolean> {
    // A product already in the room (a stale button of another tab's change): the api answers
    // `replaced: null` for a repeat (A86), which is no news.
    const before = queryClient.getQueryData<FittingRoom>(fittingRoomKeys.all);
    const already = before?.items.some((item) => item.product.id === request.product.id) ?? false;
    const owner = userId;
    let replaced: FittingRoomItem | null;
    try {
      const change = await putMutation.mutateAsync(request);
      ({ replaced } = change);
      setRoom(owner, () => change.room);
    } catch (failure) {
      failed(failure);
      return false;
    }
    if (announce === 'silent' || !isRoomOwner(owner)) return true;
    if (replaced !== null && replaced.product.id !== request.product.id) {
      const previous = replaced;
      showToast({
        title: `Заменили ${SLOT_ACCUSATIVE[request.slot]}: ${quoted(request.product)} вместо ${quoted(previous.product)}`,
        actionLabel: 'Вернуть',
        onAction: own(owner, () => undo(previous, 'replace')),
      });
    } else if (replaced === null && !already) {
      showToast({
        title: `${quoted(request.product)} в примерочной: ${SLOT_TITLES[request.slot].toLocaleLowerCase('ru-RU')}`,
        actionLabel: 'Открыть',
        onAction: own(owner, () => {
          const room = queryClient.getQueryData<FittingRoom>(fittingRoomKeys.all);
          trackElementClick('room.open', { source: 'toast', items: room?.count ?? 0 });
          openRoom();
        }),
      });
    }
    return true;
  }

  async function remove(item: FittingRoomItem): Promise<boolean> {
    const owner = userId;
    try {
      await removeMutation.mutateAsync(item);
      setRoom(owner, (current) => withoutSlot(current, item.slot));
    } catch (failure) {
      failed(failure);
      return false;
    }
    if (!isRoomOwner(owner)) return true;
    showToast({
      title: `Убрали ${quoted(item.product)} из примерочной`,
      actionLabel: 'Вернуть',
      onAction: own(owner, () => undo(item, 'remove')),
    });
    return true;
  }

  async function clear(): Promise<boolean> {
    const owner = userId;
    try {
      await clearMutation.mutateAsync();
      setRoom(owner, () => EMPTY_ROOM);
    } catch (failure) {
      failed(failure);
      return false;
    }
    return true;
  }

  return {
    put,
    remove,
    clear,
    // A write is on its way: the room's controls wait for it.
    pending: putMutation.isPending || removeMutation.isPending || clearMutation.isPending,
  };
}
