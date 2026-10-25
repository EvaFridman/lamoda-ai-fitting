import { create } from 'zustand';

// Where the room was opened from (spec 0019 A90.7): the header's icon, the toast's «Открыть», the
// limit card's «Перейти в примерочную». The analytics' `room.open` sends it.
export type RoomOpenSource = 'header' | 'toast' | 'limit';

// The wishes field's limit (A16; the api's `promptText`).
export const ROOM_WISHES_MAX = 200;

interface RoomState {
  // The room's drawer is mounted once (the root layout), so anything opens it through here: a
  // widget imports no widget.
  open: boolean;
  // The look's try-on window (T26), mounted once in the root layout as the drawer is: the drawer's
  // «Примерить образ» opens it.
  lookOpen: boolean;
  // «Пожелания к образу» of one user, kept in the tab's memory only (A90.5): never in storage
  // (personal text), gone on a reload, and never shown to another user signed in at the tab.
  wishes: { userId: string; text: string } | null;
  // Who is signed in at the tab, as the drawer (mounted on every page) last saw: a write's answer
  // or a toast's action belongs to the user who started it (spec 0017 U22). `undefined`: not
  // known yet, nothing is refused.
  userId: string | null | undefined;
  setOpen: (open: boolean) => void;
  setLookOpen: (open: boolean) => void;
  setWishes: (userId: string, text: string) => void;
  // A change of user; signed out (`null`) forgets the wishes too.
  setUser: (userId: string | null) => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  open: false,
  lookOpen: false,
  wishes: null,
  userId: undefined,
  setOpen: (open) => set({ open }),
  setLookOpen: (lookOpen) => set({ lookOpen }),
  setWishes: (userId, text) => set({ wishes: { userId, text: text.slice(0, ROOM_WISHES_MAX) } }),
  setUser: (userId) =>
    set((state) => ({
      userId,
      wishes: state.wishes?.userId === userId ? state.wishes : null,
    })),
}));

// Whether `owner` is still the one signed in at the tab (or nobody knows otherwise yet).
export function isRoomOwner(owner: string | null): boolean {
  const current = useRoomStore.getState().userId;
  return owner !== null && (current === undefined || current === owner);
}

// Opens the room's drawer; outside React too (a toast's action).
export function openRoom(): void {
  useRoomStore.getState().setOpen(true);
}

// Closes it: a link inside it was followed, to another page or to the one it is on.
export function closeRoom(): void {
  useRoomStore.getState().setOpen(false);
}

// «Примерить образ»: the room's drawer closes and the look's try-on opens (two dialogs do not
// stack, A90.12).
export function openLookTryOn(): void {
  useRoomStore.setState({ open: false, lookOpen: true });
}

// The wishes of this user, else none.
export function useRoomWishes(userId: string): string {
  return useRoomStore((state) => (state.wishes?.userId === userId ? state.wishes.text : ''));
}
