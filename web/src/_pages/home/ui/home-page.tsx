import { Suspense } from 'react';

import { Greeting } from '@/widgets/greeting';

import styles from './home-page.module.scss';

export function HomePage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Lamoda AI Fitting</h1>
      {/* Static shell above, prerendered at build; the greeting comes from the api per request. */}
      <Suspense fallback={<p className={styles.loading}>Загрузка…</p>}>
        <Greeting />
      </Suspense>
    </main>
  );
}
