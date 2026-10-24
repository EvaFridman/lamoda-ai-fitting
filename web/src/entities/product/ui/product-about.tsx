import { useId } from 'react';

import type { ProductDetail } from '../model/schemas';

import styles from './product-about.module.scss';

export interface ProductAboutProps {
  product: ProductDetail;
  className?: string;
}

// «Хлопок» from «хлопок»: board 1 writes the values from a capital.
function capitalised(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}

// Board 1's «О товаре» (spec 0019 A83.1–3): one heading drawn as the active tab, the description
// whole, then every attribute of the product (its values joined) and «Артикул» last, each a label,
// a dotted leader and the value.
export function ProductAbout({ product, className }: ProductAboutProps) {
  const rows = [
    ...product.attributes
      .filter((attribute) => attribute.values.length > 0)
      .map((attribute) => ({
        key: attribute.attribute.id,
        label: attribute.attribute.name,
        value: capitalised(attribute.values.map((value) => value.value).join(', ')),
      })),
    { key: 'article', label: 'Артикул', value: product.article },
  ];
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={[styles.about, className].filter(Boolean).join(' ')}
    >
      <h2 id={headingId} className={styles.heading}>
        О товаре
      </h2>
      {product.description === null ? null : (
        <p className={styles.description}>{product.description}</p>
      )}
      <dl className={styles.attributes}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
