'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, Suspense, useState } from 'react';

import { AnalyticsGate, ConsentBanner } from '@/features/cookie-consent';
import { retryDelay, shouldRetry } from '@/shared/api';
import { ToastProvider } from '@/shared/ui';

// Catalog data counts as fresh for 60 s (H7). No refetch when the window regains focus: the catalog
// changes rarely and each refetch counts against the read quota; a refetch when the network comes
// back, so an error or old data does not stay on screen (H22). Retries: `shouldRetry` (H10).
export function createBrowserQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetry,
        retryDelay,
      },
    },
  });
}

// Client-side providers for the whole app. TanStack Query holds server data fetched in the browser
// (hooks live in entities/*/api). UI-only state goes to Zustand stores in the slice that owns it
// (e.g. features/<name>/model); server data never goes there. ToastProvider renders the toasts that
// showToast adds from anywhere in the app. AnalyticsGate starts analytics only after consent, which
// ConsentBanner asks for (spec 0008 plan §4).
export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session, not per render.
  const [queryClient] = useState(createBrowserQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* It reads the path, which a route with a dynamic segment (`/catalog/[slug]`) knows only
            per request; without its own boundary that would block the whole page's prerender. It
            renders nothing, so the fallback is nothing too. */}
        <Suspense fallback={null}>
          <AnalyticsGate />
        </Suspense>
        <ConsentBanner />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
