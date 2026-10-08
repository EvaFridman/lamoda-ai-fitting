import type { SelectOption } from '@/shared/ui';

// The colours of a product, each with its photo from the demo catalog, as Lamoda's colour select.
export const colorOptions: SelectOption[] = [
  { value: 'white', label: 'Белый', thumbnail: '/media/seed/products/BRS-TS-001/1.webp' },
  { value: 'black', label: 'Черный', thumbnail: '/media/seed/products/BRS-TS-002/1.webp' },
  { value: 'mint', label: 'Мятный', thumbnail: '/media/seed/products/LMR-TS-003/1.webp' },
  { value: 'blue', label: 'Голубой', thumbnail: '/media/seed/products/OST-TS-004/1.webp' },
];

// The sizes of a product, as Lamoda's size select names them; one is out of stock.
export const sizeOptions: SelectOption[] = [
  { value: '40-42', label: '40/42 RUS (XS)' },
  { value: '42-44', label: '42/44 RUS (S)' },
  { value: '44-46', label: '44/46 RUS (M)' },
  { value: '46-48', label: '46/48 RUS (L)', disabled: true },
  { value: '48-50', label: '48/50 RUS (XL)' },
  { value: '50-52', label: '50/52 RUS (XXL)' },
  { value: '52-54', label: '52/54 RUS (3XL)' },
  { value: '54-56', label: '54/56 RUS (4XL)' },
];
