'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

// Client-side providers for the whole app. TanStack Query holds server data fetched in the browser
// (hooks live in entities/*/api). UI-only state goes to Zustand stores in the slice that owns it
// (e.g. features/<name>/model); server data never goes there.
export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session, not per render.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
