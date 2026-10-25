'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FITTINGS_HREF } from '@/shared/config';
import { Link } from '@/shared/ui';
import { AccountShell } from '@/widgets/account-shell';
import { FittingCompare } from '@/widgets/fitting-compare';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | null): string | undefined {
  return value !== null && UUID.test(value) ? value : undefined;
}

// The two entries of the address: `?a=<id>&b=<id>` (spec 0019 A93.1).
function ComparedFromAddress() {
  const params = useSearchParams();
  return <FittingCompare a={uuidParam(params.get('a'))} b={uuidParam(params.get('b'))} />;
}

// The compare of two fittings (spec 0019 board 9, A41, A93): `/customer/fittings/compare`, inside
// the account's shell under «Мои примерки», titled «Сравнение» with «← История примерок» on every
// width. The ids are read from the address in the browser, inside its `<Suspense>`.
export function FittingComparePage() {
  return (
    <AccountShell
      section="fittings"
      title="Сравнение"
      back={
        <Link href={FITTINGS_HREF} variant="secondary">
          ← История примерок
        </Link>
      }
    >
      <Suspense>
        <ComparedFromAddress />
      </Suspense>
    </AccountShell>
  );
}
