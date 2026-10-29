import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { storeListOptions } from '@/entities/store/server';
import { reportFailure } from '@/shared/api';
import { prefetch } from '@/shared/api/server';
import { AccountShell } from '@/widgets/account-shell';

import { StoresSkeleton, StoresView } from './stores-view';

// `/customer/stores` (spec 0022 X3, X4, X15, plan §3.3): Lamoda's «Магазины Lamoda Sport» inside the
// account's frame, for everyone, signed in or not: the city's row, the search, the list and the
// map (no legend of the store kinds, spec 0026 C16). The stores render per request from the page cache (`getStores`); the map loads in the
// browser only.
export function StoresPage() {
  return (
    <AccountShell section="stores" public title="Магазины Lamoda Sport">
      <Suspense fallback={<StoresSkeleton />}>
        <StoresContent />
      </Suspense>
    </AccountShell>
  );
}

async function StoresContent() {
  await connection();
  const queryClient = new QueryClient();
  // A failure is not dehydrated: the list asks again in the browser.
  const failure = await prefetch(queryClient, storeListOptions());
  if (failure !== undefined) reportFailure(failure);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StoresView />
    </HydrationBoundary>
  );
}
