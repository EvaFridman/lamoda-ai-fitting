import { plural } from '@/shared/lib';

const productForms = ['товар', 'товара', 'товаров'] as const;

// "128 товаров".
export function productCount(total: number): string {
  return `${total} ${plural(total, productForms)}`;
}
