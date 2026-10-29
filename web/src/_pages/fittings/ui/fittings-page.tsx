'use client';

import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { LimitMeter, renewalDate, triesLeftOfText, useFittingQuota } from '@/entities/fitting';
import { AccountShell } from '@/widgets/account-shell';
import { FittingHistory } from '@/widgets/fitting-history';

import { TryOnEntry } from './try-on-entry';

// Board 9's meter under the side menu: «Осталось 11 из 40 примерок в этом месяце», «Обновится 1
// ноября».
function FittingLimit() {
  const quota = useFittingQuota();
  if (!quota.data) return null;
  const { left, limit, renewsAt } = quota.data;
  return (
    <LimitMeter
      left={left}
      limit={limit}
      layout="stacked"
      caption={`Обновится ${renewalDate(renewsAt)}`}
    >
      {triesLeftOfText(left, limit)}
    </LimitMeter>
  );
}

// «Мои примерки» (spec 0019 T16): `/customer/fittings`, the history inside the account's shell with
// the limit under its menu. A card opens its fitting in the try-on window through `?fitting=<id>`,
// the address the toast's «Открыть» and the product page's «Вы это примеряли» use (A77.6, A82).
export function FittingsPage() {
  const router = useRouter();
  return (
    <AccountShell section="fittings" aside={<FittingLimit />}>
      <Suspense>
        <TryOnEntry />
      </Suspense>
      <FittingHistory
        onOpen={(fitting) => {
          // The address's other parameters stay; read at the click, so the page needs no
          // `useSearchParams` outside its `<Suspense>`.
          const params = new URLSearchParams(window.location.search);
          params.set('fitting', fitting.id);
          router.replace(`/customer/fittings?${params.toString()}`, { scroll: false });
        }}
      />
    </AccountShell>
  );
}
