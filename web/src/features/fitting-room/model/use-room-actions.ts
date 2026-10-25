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

// The tab's room writes on their way, across every `useRoomActions` (two cards' hangers each have
// one). Two that overlap may run on the api in either order and answer in either order, so neither
// answer is the room: an overlapped write's answer is dropped, and the room is read once the last
// of them ends, when no write of the tab is left to race that read (a new one cancels it, and its
// own answer then reads the room again: `endWrite`). Shared
// by every user of the tab: another user's answer goes to a read anyway (`isRoomOwner`).
let writesInFlight = 0;
let overlapped = false;
// A read of the room a write cancelled (a return to focus, a mount): its answer is owed, so the
// next write's answer reads the room again instead of going over the cache it left.
let readCancelled = false;

function startWrite(): void {
  if (writesInFlight > 0) overlapped = true;
  writesInFlight += 1;
}

function failed(failure: unknown): void {
  showToast({ title: errorText(failure), tone: 'error' });
  reportFailure(failure);
}

// The fitting room's writes (spec 0019 AC13, A86): put or replace an item, remove one, empty the
// room, each answered in the cache with no read after it, with board 2's toasts; writes that
// overlap, or a write over a room being read, are read once after the last of them ends (A97).
// Writes are
// mutations with no retry and nothing kept (`gcTime: 0`), as the account's (spec 0017 plan §4).
// A failure shows its text in a toast and is reported. Everything is the user's who started it: an
// answer that arrives after another user signed in at the tab is not put into their cache (the room
// is read again), and a toast's action does nothing for them (spec 0017 U22).
export function useRoomActions() {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.user.id : null;

  const readRoom = () => {
    readCancelled = false;
    void queryClient.invalidateQueries({ queryKey: fittingRoomKeys.all });
  };

  // The end of `owner`'s write, with its answer when it succeeded: the whole room (a put's, a
  // clear's) or a change of the cached one (a remove's). Into the cache only while `owner` is still
  // the one signed in and no other write overlapped it; else the room is read again, at once for
  // another user, after the last overlapping write otherwise.
  function endWrite(
    owner: string | null,
    answer?: { room: FittingRoom } | { change: (current: FittingRoom) => FittingRoom },
  ) {
    writesInFlight -= 1;
    const alone = !overlapped;
    if (writesInFlight === 0) overlapped = false;
    if (!isRoomOwner(owner)) {
      readRoom();
    } else if (!alone) {
      if (writesInFlight === 0) readRoom();
    } else if (!answer) {
      // A failed write may still have reached the api (a timeout), and may have cancelled a read.
      readRoom();
    } else {
      // A read started during the write may overwrite any answer, and a change needs the room
      // under it: not one whose read a write cancelled or that waits for a read (a remove would
      // take its slot out of a stale room). Either way the room is read again. A whole room is
      // newer than any read the write cancelled, so it settles that read.
      const stale =
        readCancelled || (queryClient.getQueryState(fittingRoomKeys.all)?.isInvalidated ?? false);
      if (
        queryClient.isFetching({ queryKey: fittingRoomKeys.all }) > 0 ||
        ('change' in answer && stale)
      ) {
        readRoom();
        return;
      }
      if ('room' in answer) {
        readCancelled = false;
        queryClient.setQueryData(fittingRoomKeys.all, answer.room);
        return;
      }
      const current = queryClient.getQueryData<FittingRoom>(fittingRoomKeys.all) ?? EMPTY_ROOM;
      queryClient.setQueryData(fittingRoomKeys.all, answer.change(current));
    }
  }

  // A toast's action, for the user it was shown to only. The toast outlives this hook's component
  // (a removed row), so the check reads the room's store, not this render.
  function own(owner: string | null, action: () => void): () => void {
    return () => {
      if (isRoomOwner(owner)) action();
    };
  }

  // A read in flight (a tab's return to focus) may have read the room before the write and answer
  // after it, over the write's answer: it is cancelled first, and owed (`readCancelled`).
  const cancelReads = () => {
    if (queryClient.isFetching({ queryKey: fittingRoomKeys.all }) > 0) readCancelled = true;
    return queryClient.cancelQueries({ queryKey: fittingRoomKeys.all });
  };

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
    startWrite();
    let change: Awaited<ReturnType<typeof putRoomItem>>;
    try {
      change = await putMutation.mutateAsync(request);
    } catch (failure) {
      endWrite(owner);
      failed(failure);
      return false;
    }
    endWrite(owner, { room: change.room });
    const { replaced } = change;
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
    startWrite();
    try {
      await removeMutation.mutateAsync(item);
    } catch (failure) {
      endWrite(owner);
      failed(failure);
      return false;
    }
    endWrite(owner, { change: (current) => withoutSlot(current, item.slot) });
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
    startWrite();
    try {
      await clearMutation.mutateAsync();
    } catch (failure) {
      endWrite(owner);
      failed(failure);
      return false;
    }
    endWrite(owner, { room: EMPTY_ROOM });
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
