// The options of the filter examples, with Lamoda's copy and its counts from the catalog snapshot.

import type { CheckboxFilterOption, PriceRange, SortFilterOption } from '@/shared/ui';

// The cheapest and the dearest product of the snapshot, the bounds of the price slider.
export const priceBounds: PriceRange = [60, 288900];

export const sortOptions: SortFilterOption[] = [
  { value: 'popularity', label: 'Подобрали для вас' },
  { value: 'new', label: 'Новинки' },
  { value: 'price-desc', label: 'Сначала дороже' },
  { value: 'price-asc', label: 'Сначала дешевле' },
  { value: 'discount', label: 'По величине скидки' },
];

export const defaultSort = 'popularity';

export const styleOptions: CheckboxFilterOption[] = [
  { value: 'evening', label: 'Вечерний', count: 16814 },
  { value: 'business', label: 'Деловой', count: 15751 },
  { value: 'casual', label: 'Повседневный', count: 216524 },
  { value: 'sport', label: 'Спортивный', count: 21951 },
];

export const brandOptions: CheckboxFilterOption[] = [
  { value: 'animiss', label: 'Animiss', count: 4210 },
  { value: 'annen', label: 'Annen', count: 1893 },
  { value: 'emberens', label: 'Emberens', count: 752 },
  { value: 'incanto', label: 'Incanto', count: 2318 },
  { value: 'innamore', label: 'Innamore', count: 1406 },
  { value: 'lime', label: 'Lime', count: 6120 },
  { value: 'mankato', label: 'Mankato', count: 389 },
  { value: 'matrix-sport', label: 'Matrix Sport', count: 517 },
  { value: 'pompa', label: 'Pompa', count: 1264 },
  { value: 'printuha', label: 'Printuha', count: 978 },
  { value: 'sandrine', label: 'Sandrine', count: 3045 },
  { value: 'zarina', label: 'Zarina', count: 5532, disabled: true },
];

// The colour filter's rows: hex colours as the api gives them, example counts, and a value with
// no colour (an empty circle).
export const colorOptions: CheckboxFilterOption[] = [
  { value: 'black', label: 'Черный', color: '#000000', count: 48210 },
  { value: 'white', label: 'Белый', color: '#FFFFFF', count: 27935 },
  { value: 'gray', label: 'Серый', color: '#B6B6B6', count: 15402 },
  { value: 'beige', label: 'Бежевый', color: '#DFBD93', count: 11876 },
  { value: 'brown', label: 'Коричневый', color: '#743D02', count: 8640 },
  { value: 'blue', label: 'Синий', color: '#3972FC', count: 9318 },
  { value: 'light-blue', label: 'Голубой', color: '#8BCDFF', count: 4127 },
  { value: 'green', label: 'Зеленый', color: '#3DB801', count: 5263 },
  { value: 'yellow', label: 'Желтый', color: '#FFEC1C', count: 2954 },
  { value: 'orange', label: 'Оранжевый', color: '#FF7A01', count: 1788 },
  { value: 'print', label: 'С принтом', count: 3410 },
];
