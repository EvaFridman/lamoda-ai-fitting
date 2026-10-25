import { buildPath, clientFetch } from '@/shared/api';

import {
  fittingRoomChangeSchema,
  type FittingRoomChange,
  type OutfitSlot,
  type PutRoomItemBody,
} from '../model/schemas';

// PUT /me/fitting-room/:slot: puts the product into its slot or replaces the slot's item.
export function putRoomItem(slot: OutfitSlot, body: PutRoomItemBody): Promise<FittingRoomChange> {
  return clientFetch(buildPath('/me/fitting-room/:slot', { slot }), fittingRoomChangeSchema, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// DELETE /me/fitting-room/:slot (204): an empty slot answers the same.
export function removeRoomItem(slot: OutfitSlot): Promise<undefined> {
  return clientFetch(buildPath('/me/fitting-room/:slot', { slot }), null, { method: 'DELETE' });
}

// DELETE /me/fitting-room (204): empties every slot.
export function clearRoom(): Promise<undefined> {
  return clientFetch(buildPath('/me/fitting-room'), null, { method: 'DELETE' });
}
