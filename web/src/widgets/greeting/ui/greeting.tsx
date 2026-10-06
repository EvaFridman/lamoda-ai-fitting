import { connection } from 'next/server';

import { getGreeting } from '@/entities/greeting';

import styles from './greeting.module.scss';

async function loadMessage(): Promise<string | null> {
  try {
    return (await getGreeting()).message;
  } catch (error) {
    console.error('Greeting: the api did not answer', error);
    return null;
  }
}

// Renders per request, never at build time: `connection()` stops prerendering here, so the build
// needs no api. Wrap it in <Suspense>; the fallback is part of the prerendered shell.
export async function Greeting() {
  await connection();
  const message = await loadMessage();
  if (message === null) {
    return (
      <p className={styles.error} role="alert">
        Не удалось получить приветствие от сервера. Попробуйте обновить страницу.
      </p>
    );
  }
  return <p className={styles.message}>{message}</p>;
}
