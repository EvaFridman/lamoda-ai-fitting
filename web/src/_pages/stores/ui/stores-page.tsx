import 'server-only';

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { storeListOptions } from '@/entities/store/server';
import { reportFailure } from '@/shared/api';
import { prefetch } from '@/shared/api/server';
import { AccountShell } from '@/widgets/account-shell';

import { LamodaSportLogo, LamodaSportOutletLogo } from './logos';
import { StoresSkeleton, StoresView } from './stores-view';

import styles from './stores-page.module.scss';

// `/customer/stores` (spec 0022 X3, X4, X15, plan §3.3): Lamoda's «Магазины Lamoda Sport» inside the
// account's frame, for everyone, signed in or not: the legend, then the search, the list and the
// map. The stores render per request from the page cache (`getStores`); the map loads in the
// browser only.
export function StoresPage() {
  return (
    <AccountShell section="stores" public title="Магазины Lamoda Sport">
      <dl className={styles.legend}>
        <div className={styles.kind}>
          <dt>
            <LamodaSportLogo className={styles.logo} />
          </dt>
          <dd>Мультибрендовый розничный магазин спортивной одежды и обуви</dd>
        </div>
        <div className={styles.kind}>
          <dt>
            <LamodaSportOutletLogo className={styles.logo} />
          </dt>
          <dd>Спортивная одежда и обувь по сниженным ценам</dd>
        </div>
      </dl>
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
