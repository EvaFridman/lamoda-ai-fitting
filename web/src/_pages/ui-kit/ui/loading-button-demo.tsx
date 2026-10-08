'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/shared/ui';

const LOADING_MS = 2000;

// The live example of `loading`: a click shows the spinner for two seconds, as a real "add to
// cart" would while it waits for the api.
export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), LOADING_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Button loading={loading} onClick={() => setLoading(true)}>
      Добавить в корзину
    </Button>
  );
}
