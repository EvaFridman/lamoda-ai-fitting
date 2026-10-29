import type { FittingItem, FittingKind } from '@/entities/fitting';

// What the wait shows of a fitting (spec 0024 AC19): a running one, or one whose start was just
// clicked and has no answer yet, so no id, status or row (plan §4.1). A `Fitting` is one.
export interface PendingFitting {
  kind: FittingKind;
  items: Pick<FittingItem, 'productId' | 'imageUrl' | 'name' | 'colour' | 'attributeValueId'>[];
  // The click's time for a start on its way, else the fitting's own.
  createdAt: string;
  // Null before the api names it: the default estimate until it does.
  estimatedSeconds: number | null;
  // Whether it spends a try-on; not known before the api answers.
  countsAgainstLimit?: boolean;
}
