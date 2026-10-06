import { connection } from 'next/server';
import { Suspense } from 'react';

import { getServerEnv } from '@/shared/config';

import styles from './footer.module.scss';

// The version is read at request time: read during prerendering, the build's value would be
// baked into the static shell forever.
async function AppVersion() {
  await connection();
  return <>версия {getServerEnv().APP_VERSION}</>;
}

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Suspense fallback={null}>
        <AppVersion />
      </Suspense>
    </footer>
  );
}
