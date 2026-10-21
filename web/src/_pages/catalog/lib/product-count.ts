import { formatAmount, plural } from '@/shared/lib';

const productForms = ['товар', 'товара', 'товаров'] as const;

// "128 товаров", "50 030 товаров": grouped as prices are, with a no-break space (O96).
export function productCount(total: number): string {
  return `${formatAmount(total)} ${plural(total, productForms)}`;
}
