'use client';

import { useEffect } from 'react';

import { errorText, reportFailure } from '@/shared/api';

import styles from './dev-catalog-page.module.scss';

// A failed query's text. The api layer has reported an `ApiError` already; anything else (a bug in
// web, H29) is reported here.
export function QueryError({ error }: { error: Error }) {
  useEffect(() => {
    reportFailure(error);
  }, [error]);

  return (
    <p className={styles.error} role="alert">
      {errorText(error)}
    </p>
  );
}
