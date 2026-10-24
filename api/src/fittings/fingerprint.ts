import { createHash } from 'node:crypto';

// What makes two try-ons the same (spec 0019 A7, A32, plan §2): the photo, the items with their
// colours and the wishes. A regeneration takes its parent's (A70), so a repeat finds it too.
export interface FingerprintInput {
  photoId: string;
  items: readonly { productId: string; attributeValueId: string | null }[];
  // Trimmed, null for none.
  promptText: string | null;
}

// sha256 in lower-case hex of a fixed JSON: the items sorted by product id, so their order in the
// request does not matter. Ids are lower case (the DTO).
export function fittingFingerprint({ photoId, items, promptText }: FingerprintInput): string {
  const sorted = [...items]
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
    .map((item) => [item.productId, item.attributeValueId]);
  return createHash('sha256')
    .update(JSON.stringify({ v: 1, photoId, items: sorted, promptText }))
    .digest('hex');
}
