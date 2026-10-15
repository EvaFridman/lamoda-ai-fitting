'use client';

import { useState } from 'react';

import { useProduct, useProducts } from '@/entities/product';
import { Button } from '@/shared/ui';

import { INVALID_PRICE_QUERY, UNKNOWN_PRODUCT_ID } from '../config/query';
import styles from './dev-catalog-page.module.scss';
import { QueryError } from './query-error';

// Error cases on demand (plan §9), each requested from the browser once its button is pressed. 4xx
// answers are neither retried (H10) nor reported (H9).
export function ErrorCases() {
  const [unknownProduct, setUnknownProduct] = useState(false);
  const [invalidPrice, setInvalidPrice] = useState(false);

  return (
    <section className={styles.cases}>
      <h2 className={styles.heading}>Ошибки</h2>
      <div className={styles.case}>
        <Button variant="outline" size={40} onClick={() => setUnknownProduct(true)}>
          Неизвестный товар (404)
        </Button>
        {unknownProduct ? <UnknownProduct /> : null}
      </div>
      <div className={styles.case}>
        <Button variant="outline" size={40} onClick={() => setInvalidPrice(true)}>
          Цена «от» выше «до» (400)
        </Button>
        {invalidPrice ? <InvalidPrice /> : null}
      </div>
    </section>
  );
}

function UnknownProduct() {
  const product = useProduct(UNKNOWN_PRODUCT_ID);
  if (product.error) return <QueryError error={product.error} />;
  if (product.data) return <p>{product.data.name}</p>;
  return <p className={styles.muted}>Загрузка…</p>;
}

function InvalidPrice() {
  const products = useProducts(INVALID_PRICE_QUERY);
  if (products.error) return <QueryError error={products.error} />;
  if (products.data) return <p>Товаров: {products.data.total}</p>;
  return <p className={styles.muted}>Загрузка…</p>;
}
