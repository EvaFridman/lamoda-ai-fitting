import { Suspense } from 'react';

import { CatalogHandoff } from './catalog-handoff';
import styles from './dev-catalog-page.module.scss';
import { ErrorCases } from './error-cases';

// A hidden page that shows the catalog data layer at work (spec 0007, H14): data loaded on the
// server and handed to the browser, a brand filter and pages requested from the browser, and the
// error texts. Only the public catalog; removed with the catalog page.
export function DevCatalogPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Каталог: слой данных</h1>
      {/* Static shell, prerendered at build; the catalog comes from the api per request. */}
      <Suspense fallback={<p className={styles.muted}>Загрузка…</p>}>
        <CatalogHandoff />
      </Suspense>
      <ErrorCases />
    </main>
  );
}
