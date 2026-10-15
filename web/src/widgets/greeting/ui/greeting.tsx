import { connection } from 'next/server';

import { getGreeting } from '@/entities/greeting/server';
import { errorText, reportFailure } from '@/shared/api';

import styles from './greeting.module.scss';

type Loaded = { message: string } | { error: string };

// A failed call shows its text and the page still answers 200 (web's health check fetches `/`); the
// api layer has reported an api failure to Sentry, `reportFailure` reports anything else (H29).
async function load(): Promise<Loaded> {
  try {
    return { message: (await getGreeting()).message };
  } catch (error) {
    reportFailure(error);
    return { error: errorText(error) };
  }
}

// Renders per request, never at build time: `connection()` stops prerendering here, so the build
// needs no api. Wrap it in <Suspense>; the fallback is part of the prerendered shell.
export async function Greeting() {
  await connection();
  const loaded = await load();
  if ('error' in loaded) {
    return (
      <p className={styles.error} role="alert">
        {loaded.error}
      </p>
    );
  }
  return <p className={styles.message}>{loaded.message}</p>;
}
