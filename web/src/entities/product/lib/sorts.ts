import type { ProductSort } from '../model/filters';

// The sort list's labels.
export const productSortLabels: Record<ProductSort, string> = {
  new: 'Новинки',
  price_desc: 'Сначала дороже',
  price_asc: 'Сначала дешевле',
  discount: 'По величине скидки',
  rating: 'По рейтингу',
};

// The order the sort list shows them in, as on Lamoda (not the api's order of `PRODUCT_SORTS`).
export const PRODUCT_SORT_ORDER: readonly ProductSort[] = [
  'new',
  'price_desc',
  'price_asc',
  'discount',
  'rating',
];
