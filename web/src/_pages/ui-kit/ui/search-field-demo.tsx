'use client';

import { useState } from 'react';

import { SearchField } from '@/shared/ui';

import styles from './examples.module.scss';

// The live example of the search form: Enter or the black button shows what would be searched.
export function SearchFieldDemo() {
  const [query, setQuery] = useState<string | null>(null);

  return (
    <div className={styles.field}>
      <SearchField onSearch={setQuery} />
      <p className={styles.props} aria-live="polite">
        {query === null ? 'Введите запрос и нажмите Enter' : `Ищем: «${query}»`}
      </p>
    </div>
  );
}
