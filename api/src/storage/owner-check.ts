import type { Logger } from '@nestjs/common';

import type { ErrorDetail } from '../common/errors/app.exception.js';
import { isInUserFolder } from './keys.js';
import type { StorageService } from './storage.service.js';

const CODE = 'IN_OWNER_FOLDER';

// The owner check of admin writes (spec 0011 M8): each key written must lie in the owner's folder,
// else a signed link in a response could lead to another user's file or to the media. `undefined`
// (left out) and `null` (cleared) write no file and pass. `ownerId` is the id the database holds.
// An empty list means every key passes.
export function ownerFolderDetails(
  keys: Record<string, string | null | undefined>,
  ownerId: string,
): ErrorDetail[] {
  return Object.entries(keys).flatMap(([field, key]) =>
    typeof key === 'string' && !isInUserFolder(key, ownerId)
      ? [{ field, code: CODE, message: `${field} must be a key in the owner's folder` }]
      : [],
  );
}

// The read side of the check (M25): a stored key is signed only when it lies in the owner's folder,
// so a row written past the write check (before it existed, by the worker, the seed or manual SQL)
// never gives a link to another user's file or to `media/` and `tmp/`. Any other key gives null
// and a warning that names the row and the field, never the key (it holds a user's id).
export interface StoredKey {
  rowId: string;
  field: string;
  key: string | null;
  ownerId: string;
}

export async function ownedLink(
  storage: StorageService,
  logger: Logger,
  { rowId, field, key, ownerId }: StoredKey,
): Promise<string | null> {
  if (key === null) {
    return null;
  }
  if (!isInUserFolder(key, ownerId)) {
    logger.warn({ msg: "A stored key is outside the owner's folder; no link", rowId, field });
    return null;
  }
  return storage.signedUrl(key);
}

// A new user has no id yet, so no key can lie in their folder: any key is refused.
export function noKeyDetails(keys: Record<string, string | null | undefined>): ErrorDetail[] {
  return Object.entries(keys).flatMap(([field, key]) =>
    typeof key === 'string'
      ? [{ field, code: CODE, message: `${field} must be null when the owner is created` }]
      : [],
  );
}
