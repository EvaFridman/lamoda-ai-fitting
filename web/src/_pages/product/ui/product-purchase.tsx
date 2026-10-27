'use client';

import { useEffect, useState } from 'react';

import type { OutfitSlot } from '@/entities/category';
import type { ProductDetail } from '@/entities/product';
import { ProductBuyBox } from '@/widgets/product-buy-box';
import { TryOn } from '@/widgets/try-on';

export interface ProductPurchaseProps {
  product: ProductDetail;
  // The product's slot of the fitting room; none shows no «Добавить к образу».
  slot: OutfitSlot | null;
}

// The buy box and the try-on window it opens (spec 0019 T20): two widgets, so the page joins them.
// The window is rendered while open; closing unmounts it (`TryOn`).
export function ProductPurchase({ product, slot }: ProductPurchaseProps) {
  const [open, setOpen] = useState(false);
  // Leaving the page (a link in the window, «Перейти в «Мои фото»») closes the window: Next keeps
  // the page hidden in an `<Activity>` with its state, which runs this cleanup, so Back shows the
  // page without the window it left. In `next dev` a Fast Refresh of this file closes it too.
  useEffect(() => () => setOpen(false), []);
  return (
    <>
      <ProductBuyBox product={product} slot={slot} onTryOn={() => setOpen(true)} />
      {open && <TryOn productId={product.id} onClose={() => setOpen(false)} />}
    </>
  );
}
