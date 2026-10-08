// The options of the filter examples, with Lamoda's copy and its counts from the catalog snapshot.

import type { CheckboxFilterOption, SortFilterOption } from '@/shared/ui';

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
