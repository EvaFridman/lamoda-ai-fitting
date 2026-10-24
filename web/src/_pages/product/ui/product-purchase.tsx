'use client';

import { useState } from 'react';

import type { ProductDetail } from '@/entities/product';
import { ProductBuyBox } from '@/widgets/product-buy-box';
import { TryOn } from '@/widgets/try-on';

export interface ProductPurchaseProps {
  product: ProductDetail;
  hasSlot: boolean;
}

// The buy box and the try-on window it opens (spec 0019 T20): two widgets, so the page joins them.
// The window is rendered while open; closing unmounts it (`TryOn`).
export function ProductPurchase({ product, hasSlot }: ProductPurchaseProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProductBuyBox product={product} hasSlot={hasSlot} onTryOn={() => setOpen(true)} />
      {open && <TryOn productId={product.id} onClose={() => setOpen(false)} />}
    </>
  );
}
